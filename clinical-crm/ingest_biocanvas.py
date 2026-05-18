"""
ingest_biocanvas.py
Embed + index clinical_patients.json and commercial_signals.json into Elasticsearch.

Usage:
    python ingest_biocanvas.py

Requires .env with:  GEMINI_API_KEY, ELASTIC_URL, ELASTIC_API_KEY
"""

import os, json, time
from pathlib import Path
from dotenv import load_dotenv
from elasticsearch import Elasticsearch, helpers
from google import genai
from google.genai import types

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# ── Clients ──────────────────────────────────────────────────
es     = Elasticsearch(os.getenv("ELASTIC_URL"), api_key=os.getenv("ELASTIC_API_KEY"))
gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

BRAIN_DIR  = Path(__file__).parent.parent / "brain"
THIS_DIR   = Path(__file__).parent

# ── Index mappings ────────────────────────────────────────────

PATIENTS_MAPPING = {
    "mappings": {
        "properties": {
            "patient_id":          { "type": "keyword" },
            "trial_id":            { "type": "keyword" },
            "trial_phase":         { "type": "keyword" },
            "state":               { "type": "keyword" },
            "age":                 { "type": "integer" },
            "gender":              { "type": "keyword" },
            "eGFR":                { "type": "float"   },
            "dropout_risk":        { "type": "keyword" },
            "enrollment_status":   { "type": "keyword" },
            "site_health_score":   { "type": "integer" },
            "enrollment_rate":     { "type": "float"   },
            "screen_failure_risk": { "type": "keyword" },
            "budget_variance":     { "type": "float"   },
            "image_path":          { "type": "keyword" },
            "clinical_notes":      { "type": "text"    },
            "embedding":           { "type": "dense_vector", "dims": 768, "index": True, "similarity": "cosine" },
        }
    }
}

SIGNALS_MAPPING = {
    "mappings": {
        "properties": {
            "signal_id":   { "type": "keyword" },
            "state":       { "type": "keyword" },
            "drug_target": { "type": "keyword" },
            "sentiment":   { "type": "keyword" },
            "source_type": { "type": "keyword" },
            "topic":       { "type": "keyword" },
            "date":        { "type": "date"    },
            "author":      { "type": "keyword" },
            "url":         { "type": "keyword" },
            "title":       { "type": "text"    },
            "transcript":  { "type": "text"    },
            "embedding":   { "type": "dense_vector", "dims": 768, "index": True, "similarity": "cosine" },
        }
    }
}


def create_index(name: str, mapping: dict):
    if es.indices.exists(index=name):
        print(f"  ⚠  Index '{name}' exists — deleting and recreating...")
        es.indices.delete(index=name)
    es.indices.create(index=name, body=mapping)
    print(f"  ✓  Index '{name}' created.")


def embed_text(text: str) -> list[float]:
    result = gemini.models.embed_content(
        model="gemini-embedding-2",
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )
    return result.embeddings[0].values


def embed_patient(patient: dict) -> list[float]:
    """Multimodal embed if brain image exists, else text-only."""
    notes      = patient.get("clinical_notes", "")
    image_file = BRAIN_DIR / patient.get("image_path", "")

    if image_file.exists():
        try:
            image_bytes = image_file.read_bytes()
            result = gemini.models.embed_content(
                model="gemini-embedding-2",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    notes,
                ],
                config=types.EmbedContentConfig(output_dimensionality=768),
            )
            return result.embeddings[0].values
        except Exception as e:
            print(f"    ⚠  Multimodal fail ({patient['patient_id']}): {e} — text fallback")

    return embed_text(notes)


# ── Ingest patients ───────────────────────────────────────────

def ingest_patients():
    print("\n── Step 1: clinical_patients ────────────────────────")
    create_index("patients", PATIENTS_MAPPING)

    patients = json.loads((THIS_DIR / "clinical_patients.json").read_text())
    actions  = []

    for i, p in enumerate(patients):
        print(f"  [{i+1}/{len(patients)}] Embedding {p['patient_id']}...")
        embedding = embed_patient(p)
        time.sleep(0.5)   # Gemini rate limit buffer

        doc = {
            "patient_id":          p["patient_id"],
            "trial_id":            p["trial_id"],
            "trial_phase":         p["trial_phase"],
            "state":               p["state"],
            "age":                 p["demographics"]["age"],
            "gender":              p["demographics"]["gender"],
            "eGFR":                p["metrics"]["eGFR"],
            "dropout_risk":        p["metrics"]["dropout_risk"],
            "enrollment_status":   p["metrics"]["enrollment_status"],
            "site_health_score":   p["metrics"]["site_health_score"],
            "enrollment_rate":     p["metrics"]["enrollment_rate"],
            "screen_failure_risk": p["metrics"]["screen_failure_risk"],
            "budget_variance":     p["metrics"]["budget_variance"],
            "image_path":          p["image_path"],
            "clinical_notes":      p["clinical_notes"],
            "embedding":           embedding,
        }
        actions.append({ "_index": "patients", "_id": p["patient_id"], "_source": doc })

    helpers.bulk(es, actions)
    print(f"\n  ✓  {len(actions)} patients indexed into 'patients'.")


# ── Ingest commercial signals ─────────────────────────────────

def ingest_signals():
    print("\n── Step 2: commercial_signals ───────────────────────")
    create_index("commercial_signals", SIGNALS_MAPPING)

    signals = json.loads((THIS_DIR / "commercial_signals.json").read_text())
    actions = []

    for i, s in enumerate(signals):
        print(f"  [{i+1}/{len(signals)}] Embedding {s['signal_id']} ({s['source_type']})...")
        embedding = embed_text(s["transcript"])
        time.sleep(0.5)

        doc = {
            "signal_id":   s["signal_id"],
            "state":       s["state"],
            "drug_target": s["drug_target"],
            "sentiment":   s["sentiment"],
            "source_type": s["source_type"],
            "topic":       s["topic"],
            "date":        s["date"],
            "author":      s["ui_metadata"]["author"],
            "url":         s["ui_metadata"]["url"],
            "title":       s["ui_metadata"].get("title", ""),
            "transcript":  s["transcript"],
            "embedding":   embedding,
        }
        actions.append({ "_index": "commercial_signals", "_id": s["signal_id"], "_source": doc })

    helpers.bulk(es, actions)
    print(f"\n  ✓  {len(actions)} signals indexed into 'commercial_signals'.")


# ── Main ──────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 50)
    print("  TrialNexus — Elasticsearch Ingest Script")
    print("=" * 50)

    if not es.ping():
        print("\n  ✗  Cannot reach Elasticsearch.")
        print("     Check ELASTIC_URL and ELASTIC_API_KEY in .env")
        exit(1)

    print(f"  ✓  Connected to Elasticsearch.")

    ingest_patients()
    ingest_signals()

    print("\n" + "=" * 50)
    print("  All done! Indices ready:")
    print("    • patients           (15 records)")
    print("    • commercial_signals (10 records)")
    print("  Start FastAPI and your React app will pull live ES data.")
    print("=" * 50)
