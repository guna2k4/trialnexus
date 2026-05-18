"""
agent_engine.py
Real Two-Agent SQL Gatekeeper for Clinical Trial Screening.

Agent 1 (Translator) — separate Gemini call, writes exclusion SQL from protocol
Agent 2 (Auditor)    — separate Gemini call, receives Agent 1 output, audits it
Python Executor      — pure Python, runs safe_sql, Gemini never decides eligibility
"""

import os, json, sqlite3
from pathlib import Path
from typing import Literal
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

DB_PATH = Path(__file__).parent / "patients.db"

# ── Database schema string (shared by both prompts) ───────────

DB_SCHEMA = """
Table: patients
  patient_id TEXT PRIMARY KEY
  age        INTEGER
  gender     TEXT
  trial_id   TEXT
  state      TEXT

Table: patient_history
  id         INTEGER PRIMARY KEY AUTOINCREMENT
  patient_id TEXT
  event_type TEXT    -- 'medication', 'diagnosis', 'procedure', 'lab'
  event_name TEXT    -- e.g. 'Aspirin', 'Temozolomide', 'Radiotherapy IMRT'
  days_ago   INTEGER -- integer: how many days ago this event occurred
""".strip()

# ── Agent 1 prompt — SQL Translator ───────────────────────────

AGENT1_PROMPT = """
You are Agent 1 — the SQL Translator for a safety-critical clinical trial screening system.

Your ONLY job: read the trial protocol and write a SQL query that returns the patient_ids of patients who must be EXCLUDED from the trial based on the exclusion rules.

### RULES
1. Convert ALL time-based rules into exact integer day comparisons using the `days_ago` column.
2. NEVER use DATE(), strftime(), or any date functions. Only use `days_ago <= N`.
3. 6 months = 180 days. 3 months = 90 days. 1 year = 365 days.
4. The SQL must return DISTINCT patient_id values.
5. Use UNION to combine multiple exclusion conditions.

### DATABASE SCHEMA
{db_schema}

### TRIAL PROTOCOL
{trial_protocol_json}

### OUTPUT FORMAT (strict JSON)
{{
  "draft_sql": "<your SQL query here>",
  "rules_applied": ["<rule 1 description>", "<rule 2 description>"]
}}
""".strip()

# ── Agent 2 prompt — SQL Auditor ──────────────────────────────

AGENT2_PROMPT = """
You are Agent 2 — the SQL Auditor for a safety-critical clinical trial screening system.

You have received a draft SQL query from Agent 1 (the Translator). Your job is to audit it strictly against the trial protocol and fix any errors.

### WHAT TO CHECK
1. Every time-based rule uses integer `days_ago` comparisons — no date functions allowed.
2. All exclusion events from the protocol are covered in the SQL.
3. The SQL returns DISTINCT patient_id values of EXCLUDED patients.
4. Logic is correct — excluded patients should truly violate the protocol.

### DATABASE SCHEMA
{db_schema}

### TRIAL PROTOCOL
{trial_protocol_json}

### AGENT 1 DRAFT SQL (audit this)
{draft_sql}

### OUTPUT FORMAT (strict JSON)
{{
  "status": "APPROVED" or "REJECTED_AND_FIXED",
  "reasoning": "<explain what you checked and whether it was correct or what you fixed>",
  "safe_sql": "<the final approved SQL — same as draft if approved, corrected version if fixed>"
}}
""".strip()


# ── Executor — pure Python, zero AI ──────────────────────────

def execute_sql(sql: str, db_path: Path = DB_PATH) -> list[str]:
    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    cur.execute(sql)
    rows = [row[0] for row in cur.fetchall()]
    conn.close()
    return sorted(set(rows))


def get_all_patient_ids(db_path: Path = DB_PATH) -> list[str]:
    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    cur.execute("SELECT patient_id FROM patients ORDER BY patient_id")
    ids  = [row[0] for row in cur.fetchall()]
    conn.close()
    return ids


_ThinkingConfig = getattr(types, "ThinkingConfig", None)
_NO_THINK = types.GenerateContentConfig(
    response_mime_type="application/json",
    temperature=0.0,
    **( {"thinking_config": _ThinkingConfig(thinking_budget=0)} if _ThinkingConfig else {} ),
)


def call_agent1(trial_protocol: dict, model: str = "gemini-2.5-flash") -> dict:
    """Agent 1: translate protocol rules into SQL. Returns { draft_sql, rules_applied }."""
    prompt = AGENT1_PROMPT.format(
        db_schema=DB_SCHEMA,
        trial_protocol_json=json.dumps(trial_protocol),
    )
    response = gemini.models.generate_content(model=model, contents=prompt, config=_NO_THINK)
    return json.loads(response.text)


def call_agent2(trial_protocol: dict, draft_sql: str, model: str = "gemini-2.5-flash") -> dict:
    """Agent 2: audit Agent 1's SQL. Returns { status, reasoning, safe_sql }."""
    prompt = AGENT2_PROMPT.format(
        db_schema=DB_SCHEMA,
        trial_protocol_json=json.dumps(trial_protocol),
        draft_sql=draft_sql,
    )
    response = gemini.models.generate_content(model=model, contents=prompt, config=_NO_THINK)
    return json.loads(response.text)


# ── Main pipeline (used by benchmark / CLI) ───────────────────

def run_agent(
    trial_protocol: dict,
    human_feedback: str = "",
    model: str = "gemini-2.5-flash",
) -> dict:
    a1 = call_agent1(trial_protocol, model)   # Gemini call 1
    a2 = call_agent2(trial_protocol, a1["draft_sql"], model)  # Gemini call 2

    safe_sql      = a2["safe_sql"]
    excluded      = execute_sql(safe_sql)
    all_ids       = get_all_patient_ids()
    pre_qualified = [pid for pid in all_ids if pid not in excluded]

    return {
        "draft_sql":            a1["draft_sql"],
        "rules_applied":        a1.get("rules_applied", []),
        "audit":                a2,
        "excluded_patient_ids": excluded,
        "pre_qualified_ids":    pre_qualified,
    }


if __name__ == "__main__":
    protocol_path = Path(__file__).parent / "protocol_NBM_BMX.json"
    protocol      = json.loads(protocol_path.read_text())
    result        = run_agent(protocol)
    print(json.dumps(result, indent=2))
