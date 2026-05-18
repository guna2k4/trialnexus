"""
setup_db.py
Creates patients.db for the NBM-BMX trial screening pipeline.

Patient IDs match the brain_patients Elasticsearch index exactly
(Brain_MRI_020, Brain_MRI_039, etc.) so BioNexus search results
feed directly into Phase 2 lab screening.

Phase 1 exclusion results:
  EXCLUDED     : Brain_MRI_020 (EX-01 chemo), Brain_MRI_021 (EX-02 anticoag),
                 Brain_MRI_040 (EX-06 RT),    Brain_MRI_034 (EX-07 immuno)
  PRE_QUALIFIED: Brain_MRI_039, Brain_MRI_028, Brain_MRI_024,
                 Brain_MRI_036, Brain_MRI_027, Brain_MRI_003

Phase 2 lab profiles:
  QUALIFIED_HIGH    : Brain_MRI_039, Brain_MRI_024, Brain_MRI_027
  QUALIFIED_MEDIUM  : Brain_MRI_028, Brain_MRI_003
  INSUFFICIENT_DATA : Brain_MRI_036
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "patients.db"

# ── Demographics ─────────────────────────────────────────────
# IDs match brain_patients ES index exactly
PATIENTS = [
    ("Brain_MRI_020", 48, "Male",   "NBM-BMX", "TX"),
    ("Brain_MRI_039", 52, "Female", "NBM-BMX", "CA"),
    ("Brain_MRI_021", 45, "Male",   "NBM-BMX", "NY"),
    ("Brain_MRI_040", 58, "Female", "NBM-BMX", "FL"),
    ("Brain_MRI_028", 41, "Female", "NBM-BMX", "OH"),
    ("Brain_MRI_034", 65, "Male",   "NBM-BMX", "PA"),
    ("Brain_MRI_024", 38, "Female", "NBM-BMX", "GA"),
    ("Brain_MRI_036", 50, "Male",   "NBM-BMX", "WA"),
    ("Brain_MRI_027", 35, "Female", "NBM-BMX", "MA"),
    ("Brain_MRI_003", 28, "Male",   "NBM-BMX", "CO"),
]

# ── Phase 1 event history ─────────────────────────────────────
# (patient_id, event_type, event_name, days_ago)
EVENTS = [
    # ── Brain_MRI_020 — Male 48 — GBM Grade IV — EXCLUDED: EX-01 (Temozolomide 90d)
    ("Brain_MRI_020", "diagnosis",  "Glioblastoma",             180),
    ("Brain_MRI_020", "procedure",  "Brain Resection Surgery",  175),
    ("Brain_MRI_020", "medication", "Temozolomide",              90),   # ← EXCLUDES EX-01
    ("Brain_MRI_020", "medication", "Dexamethasone",             30),
    ("Brain_MRI_020", "lab",        "Low Platelets 82k",         30),

    # ── Brain_MRI_039 — Female 52 — GBM Grade IV — PRE_QUALIFIED
    ("Brain_MRI_039", "diagnosis",  "Glioblastoma",             300),
    ("Brain_MRI_039", "procedure",  "Brain Resection Surgery",  295),
    ("Brain_MRI_039", "procedure",  "MRI Brain RANO Stable",     60),
    ("Brain_MRI_039", "lab",        "Normal Complete Labs",      21),
    ("Brain_MRI_039", "procedure",  "Neuro-Oncology Follow-Up",   7),

    # ── Brain_MRI_021 — Male 45 — GBM Grade IV — EXCLUDED: EX-02 (Aspirin 5d)
    ("Brain_MRI_021", "diagnosis",  "Glioblastoma",             120),
    ("Brain_MRI_021", "procedure",  "Biopsy",                   115),
    ("Brain_MRI_021", "diagnosis",  "Hypertension",             700),
    ("Brain_MRI_021", "medication", "Aspirin",                    5),   # ← EXCLUDES EX-02
    ("Brain_MRI_021", "lab",        "Normal CBC",                30),

    # ── Brain_MRI_040 — Female 58 — GBM Grade IV — EXCLUDED: EX-06 (Radiotherapy IMRT 120d)
    ("Brain_MRI_040", "diagnosis",  "Glioblastoma",             300),
    ("Brain_MRI_040", "procedure",  "Radiotherapy IMRT",        120),   # ← EXCLUDES EX-06
    ("Brain_MRI_040", "medication", "Dexamethasone",             45),
    ("Brain_MRI_040", "lab",        "CBC Normal",                30),
    ("Brain_MRI_040", "procedure",  "Oncology Follow-Up",        14),

    # ── Brain_MRI_028 — Female 41 — GBM Grade IV — PRE_QUALIFIED
    ("Brain_MRI_028", "diagnosis",  "Glioblastoma",             250),
    ("Brain_MRI_028", "procedure",  "Brain Resection Surgery",  245),
    ("Brain_MRI_028", "procedure",  "MRI Brain Stable",          60),
    ("Brain_MRI_028", "lab",        "Normal Blood Count",        14),
    ("Brain_MRI_028", "procedure",  "Neuro-Oncology Clinic",      7),

    # ── Brain_MRI_034 — Male 65 — GBM Grade IV — EXCLUDED: EX-07 (Pembrolizumab 60d)
    ("Brain_MRI_034", "diagnosis",  "Glioblastoma",             200),
    ("Brain_MRI_034", "medication", "Pembrolizumab",             60),   # ← EXCLUDES EX-07
    ("Brain_MRI_034", "procedure",  "CT Scan Partial Response",  30),
    ("Brain_MRI_034", "lab",        "LFT Mildly Elevated",       21),
    ("Brain_MRI_034", "procedure",  "Oncology Clinic",            7),

    # ── Brain_MRI_024 — Female 38 — Anaplastic Astrocytoma — PRE_QUALIFIED
    ("Brain_MRI_024", "diagnosis",  "Anaplastic Astrocytoma",   400),
    ("Brain_MRI_024", "procedure",  "Biopsy",                   395),
    ("Brain_MRI_024", "procedure",  "MRI Brain Stable",          90),
    ("Brain_MRI_024", "lab",        "Normal Complete Labs",      21),
    ("Brain_MRI_024", "procedure",  "Neurology Follow-Up",        7),

    # ── Brain_MRI_036 — Male 50 — GBM Grade IV — PRE_QUALIFIED
    ("Brain_MRI_036", "diagnosis",  "Glioblastoma",             350),
    ("Brain_MRI_036", "procedure",  "MRI Brain",                 60),
    ("Brain_MRI_036", "lab",        "Normal Labs",               30),
    ("Brain_MRI_036", "procedure",  "Neuro-Oncology Visit",      14),

    # ── Brain_MRI_027 — Female 35 — Oligodendroglioma — PRE_QUALIFIED
    ("Brain_MRI_027", "diagnosis",  "Oligodendroglioma",        500),
    ("Brain_MRI_027", "procedure",  "Brain Resection Surgery",  495),
    ("Brain_MRI_027", "procedure",  "MRI Brain Stable",         180),
    ("Brain_MRI_027", "lab",        "Normal Complete Labs",      14),
    ("Brain_MRI_027", "procedure",  "Oncology Follow-Up",         7),

    # ── Brain_MRI_003 — Male 28 — Diffuse Astrocytoma — PRE_QUALIFIED
    ("Brain_MRI_003", "diagnosis",  "Diffuse Astrocytoma",      600),
    ("Brain_MRI_003", "procedure",  "Biopsy",                   595),
    ("Brain_MRI_003", "procedure",  "MRI Brain Stable",         200),
    ("Brain_MRI_003", "lab",        "Normal Labs",               30),
    ("Brain_MRI_003", "procedure",  "Neurology Clinic",           7),
]

# ── Phase 2 numeric lab values ────────────────────────────────
# Only PRE_QUALIFIED patients get lab rows (excluded patients skip Phase 2)
# Thresholds: Platelets>=75 k/µL, Hgb>=8.0 g/dL, ANC>=1.5 ×10⁹/L,
#             Creatinine<=1.5 ×ULN, AST<=2.5 ×ULN
LAB_EVENTS = [
    # Brain_MRI_039 — QUALIFIED_HIGH (all 5 labs, all clearly passing)
    ("Brain_MRI_039", "lab", "Platelets",  21, 192.0),
    ("Brain_MRI_039", "lab", "Hgb",        21,  12.4),
    ("Brain_MRI_039", "lab", "ANC",        21,   2.1),
    ("Brain_MRI_039", "lab", "Creatinine", 21,   0.9),
    ("Brain_MRI_039", "lab", "AST",        21,   1.4),

    # Brain_MRI_028 — QUALIFIED_MEDIUM (Platelets 81, Hgb 9.6, AST 2.1 — borderline)
    ("Brain_MRI_028", "lab", "Platelets",  14,  81.0),
    ("Brain_MRI_028", "lab", "Hgb",        14,   9.6),
    ("Brain_MRI_028", "lab", "ANC",        14,   1.7),
    ("Brain_MRI_028", "lab", "Creatinine", 14,   1.2),
    ("Brain_MRI_028", "lab", "AST",        14,   2.1),

    # Brain_MRI_024 — QUALIFIED_HIGH
    ("Brain_MRI_024", "lab", "Platelets",  21, 215.0),
    ("Brain_MRI_024", "lab", "Hgb",        21,  13.2),
    ("Brain_MRI_024", "lab", "ANC",        21,   2.4),
    ("Brain_MRI_024", "lab", "Creatinine", 21,   0.8),
    ("Brain_MRI_024", "lab", "AST",        21,   1.1),

    # Brain_MRI_036 — INSUFFICIENT_DATA (only 2 of 5 labs on record)
    ("Brain_MRI_036", "lab", "Platelets",  30, 148.0),
    ("Brain_MRI_036", "lab", "Hgb",        30,  11.2),
    # ANC, Creatinine, AST missing intentionally

    # Brain_MRI_027 — QUALIFIED_HIGH
    ("Brain_MRI_027", "lab", "Platelets",  14, 228.0),
    ("Brain_MRI_027", "lab", "Hgb",        14,  13.8),
    ("Brain_MRI_027", "lab", "ANC",        14,   2.9),
    ("Brain_MRI_027", "lab", "Creatinine", 14,   0.7),
    ("Brain_MRI_027", "lab", "AST",        14,   1.0),

    # Brain_MRI_003 — QUALIFIED_MEDIUM (Hgb 8.3 and ANC 1.5 borderline)
    ("Brain_MRI_003", "lab", "Platelets",  30, 176.0),
    ("Brain_MRI_003", "lab", "Hgb",        30,   8.3),
    ("Brain_MRI_003", "lab", "ANC",        30,   1.5),
    ("Brain_MRI_003", "lab", "Creatinine", 30,   1.0),
    ("Brain_MRI_003", "lab", "AST",        30,   1.8),
]


def build():
    if DB_PATH.exists():
        DB_PATH.unlink()
        print("  Removed existing patients.db")

    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    cur.execute("""
        CREATE TABLE patients (
            patient_id TEXT PRIMARY KEY,
            age        INTEGER,
            gender     TEXT,
            trial_id   TEXT,
            state      TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE patient_history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT,
            event_type TEXT,
            event_name TEXT,
            days_ago   INTEGER,
            lab_value  REAL
        )
    """)

    cur.executemany("INSERT INTO patients VALUES (?,?,?,?,?)", PATIENTS)

    cur.executemany(
        "INSERT INTO patient_history (patient_id, event_type, event_name, days_ago) VALUES (?,?,?,?)",
        EVENTS
    )

    cur.executemany(
        "INSERT INTO patient_history (patient_id, event_type, event_name, days_ago, lab_value) VALUES (?,?,?,?,?)",
        LAB_EVENTS
    )

    conn.commit()
    conn.close()

    print(f"  [OK] patients.db at {DB_PATH}")
    print(f"  [OK] {len(PATIENTS)} patients  |  {len(EVENTS)} phase-1 events  |  {len(LAB_EVENTS)} phase-2 lab rows")
    print()
    print("  Phase 1 — EXCLUDED     : Brain_MRI_020, Brain_MRI_021, Brain_MRI_040, Brain_MRI_034")
    print("  Phase 1 — PRE_QUALIFIED: Brain_MRI_039, Brain_MRI_028, Brain_MRI_024, Brain_MRI_036, Brain_MRI_027, Brain_MRI_003")
    print()
    print("  Phase 2 — HIGH        : Brain_MRI_039, Brain_MRI_024, Brain_MRI_027")
    print("  Phase 2 — MEDIUM      : Brain_MRI_028, Brain_MRI_003")
    print("  Phase 2 — INSUFFICIENT: Brain_MRI_036")


if __name__ == "__main__":
    print("=== Setting up patients.db ===")
    build()
