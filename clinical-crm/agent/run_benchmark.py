"""
run_benchmark.py
End-to-end test of the multi-agent SQL gatekeeper for the NBM-BMX Phase III trial.

Prints to terminal:
  1. Trial protocol summary
  2. Agent 1 draft SQL
  3. Agent 2 audit result (JSON)
  4. Excluded patient IDs (deterministic SQL execution)
  5. Pre-qualified patients -> ready for CRC (Clinical Research Coordinator) review
"""

import json
from pathlib import Path
from setup_db   import build as build_db
from agent_engine import run_agent

# -- Helpers ---------------------------------------------------

def divider(title: str):
    width = 62
    print("\n" + "=" * width)
    print(f"  {title}")
    print("=" * width)

def box(label: str, content: str):
    print(f"\n  +- {label}")
    for line in content.strip().splitlines():
        print(f"  |  {line}")
    print("  +" + "-" * 50)

# -- Run -------------------------------------------------------

def main():
    divider("TrialNexus -- Multi-Agent Gatekeeper Benchmark")
    print("  Trial  : NBM-BMX Phase III Glioblastoma")
    print("  Patients: 15 (PT-001 … PT-015)")
    print("  Engine : Gemini 2.5 Flash + SQLite Semantic Layer")

    # -- Step 0: (re)build the database --
    divider("Step 0 -- Building patients.db")
    build_db()

    # -- Load protocol --
    protocol_path = Path(__file__).parent / "protocol_NBM_BMX.json"
    protocol      = json.loads(protocol_path.read_text())

    # -- Print protocol summary --
    divider("Step 1 -- NBM-BMX Trial Exclusion Protocol")
    for rule in protocol["exclusion_criteria"]:
        names = ", ".join(rule.get("event_names", [rule.get("condition", "")]))
        print(f"  [{rule['rule_id']}] {rule['description']}")
        print(f"         -> Drugs/events: {names}")
        print()
    print("  Timeline rule: ALWAYS use days_ago as integer. 6 months = 180 days.")

    # -- Run multi-agent pipeline --
    divider("Step 2 -- Running Multi-Agent Pipeline (Gemini)...")
    print("  Calling Agent 1 (Translator) + Agent 2 (Auditor)...")

    result = run_agent(protocol, human_feedback="")

    # -- Print Agent 1 SQL --
    divider("Step 3 -- Agent 1: Draft SQL")
    box("DRAFT SQL", result["draft_sql"])

    # -- Print Agent 2 Audit --
    divider("Step 4 -- Agent 2: Audit Result")
    audit = result["audit"]
    status_icon = "[PASS] APPROVED" if audit["status"] == "APPROVED" else "⚠ REJECTED_AND_FIXED"
    print(f"\n  Status   : {status_icon}")
    print(f"\n  Reasoning:")
    for line in audit["reasoning"].strip().splitlines():
        print(f"    {line}")

    if audit["status"] == "REJECTED_AND_FIXED":
        box("SAFE SQL (corrected by Agent 2)", audit["safe_sql"])
    else:
        print("\n  Safe SQL : same as draft (approved without changes)")

    # -- Print final results --
    divider("Step 5 -- Executor: Deterministic SQL Results")
    print("\n  EXCLUDED patients (violate >=1 exclusion rule):")
    for pid in result["excluded_patient_ids"]:
        reasons = KNOWN_REASONS.get(pid, "see protocol rules")
        print(f"    [X]  {pid}  --  {reasons}")

    print(f"\n  PRE-QUALIFIED patients (ready for CRC review):")
    for pid in result["pre_qualified_ids"]:
        print(f"    [PASS]  {pid}")

    # -- Summary --
    divider("Summary")
    total     = len(result["excluded_patient_ids"]) + len(result["pre_qualified_ids"])
    excluded  = len(result["excluded_patient_ids"])
    qualified = len(result["pre_qualified_ids"])
    print(f"  Total screened    : {total}")
    print(f"  Excluded by AI    : {excluded}")
    print(f"  Pre-qualified     : {qualified}  <- handed to CRC for verification + consent")
    print()
    print("  NEXT STEP -> CRC (Clinical Research Coordinator) calls each")
    print("  pre-qualified patient to confirm identity, recent medication")
    print("  changes, and obtain consent before final enrollment.")
    print()
    print("  Audit status      :", audit["status"])
    print("  Engine            : Gemini 2.5 Flash (Agent 1 + Agent 2)")
    print("  Execution         : Pure Python SQLite (zero AI in final decision)")
    divider("Benchmark Complete")


# Known exclusion reasons for readable output
KNOWN_REASONS = {
    "PT-001": "Temozolomide 90 days ago (EX-01: chemo <= 180d)",
    "PT-003": "Aspirin 5 days ago (EX-02: anticoagulant <= 10d)",
    "PT-004": "Chemotherapy 120 days ago (EX-01: chemo <= 180d)",
    "PT-005": "Immunotherapy + Chemotherapy 45 days ago (EX-01 + EX-07: <= 180d)",
    "PT-008": "Radiotherapy IMRT 60 days ago (EX-06) + Warfarin 5 days ago (EX-02)",
    "PT-010": "Aspirin 3 days ago (EX-02: anticoagulant <= 10d)",
    "PT-011": "Chemotherapy 150 days ago (EX-01: chemo <= 180d)",
    "PT-012": "Temozolomide 120 days ago (EX-01: chemo <= 180d)",
    "PT-014": "Temozolomide 60 days ago (EX-01) + Apixaban 2 days ago (EX-02)",
}


if __name__ == "__main__":
    main()
