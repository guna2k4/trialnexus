"""
ingest_bulk.py — Bulk ingest brain MRI patients from a CSV file into Elasticsearch.

Usage:
    python ingest_bulk.py --csv patients.csv --images ./brain

CSV columns (see sample_patients.csv for example):
    patientId, sex, age, tumorSize, tumorGrade, histologicType,
    mgmtStatus, idhStatus, surgery, matchPercentage, imageRef

.env needs:
    ES_URL=http://144.202.52.13:9200
    GEMINI_API_KEY=...
"""

import os, csv, time, argparse
from pathlib import Path
from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from google import genai
from google.genai import types

load_dotenv()

ES_URL = os.getenv("ES_URL", "http://localhost:9200")
es     = Elasticsearch(ES_URL)
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

INDEX = "brain_patients"

def ensure_index():
    if not es.indices.exists(index=INDEX):
        es.indices.create(index=INDEX, mappings={
            "properties": {
                "patientId":      {"type": "keyword"},
                "sex":            {"type": "keyword"},
                "age":            {"type": "integer"},
                "tumorSize":      {"type": "keyword"},
                "tumorGrade":     {"type": "keyword"},
                "histologicType": {"type": "text"},
                "mgmtStatus":     {"type": "keyword"},
                "idhStatus":      {"type": "keyword"},
                "surgery":        {"type": "keyword"},
                "matchPercentage":{"type": "integer"},
                "imageRef":       {"type": "keyword"},
                "clinicalText":   {"type": "text"},
                "vector":         {"type": "dense_vector", "dims": 768, "index": True, "similarity": "cosine"}
            }
        })
        print(f"✓ Index '{INDEX}' created")
    else:
        print(f"✓ Index '{INDEX}' already exists")


def embed_with_retry(image_path, clinical_text, max_retries=5):
    """Call Gemini embedding. Auto-retries on rate limit with increasing wait."""
    for attempt in range(max_retries):
        try:
            contents = [clinical_text]
            if image_path and Path(image_path).exists():
                image_bytes = Path(image_path).read_bytes()
                contents = [
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    clinical_text,
                ]
            else:
                if image_path:
                    print(f"  ⚠  Image not found: {image_path} — using text-only embedding")

            result = client.models.embed_content(
                model="gemini-embedding-2",
                contents=contents,
                config=types.EmbedContentConfig(output_dimensionality=768),
            )
            return result.embeddings[0].values

        except Exception as e:
            err = str(e)
            if "429" in err or "quota" in err.lower() or "rate" in err.lower():
                wait = 30 * (attempt + 1)
                print(f"  ⏳ Rate limited — waiting {wait}s then retrying ({attempt+1}/{max_retries})...")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError(f"Embedding failed after {max_retries} retries")


def ingest_csv(csv_path, images_folder):
    ensure_index()

    images_folder = Path(images_folder)
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"\n📋 {len(rows)} patients found in CSV\n")
    ok = 0

    for i, row in enumerate(rows):
        pid       = row["patientId"].strip()
        image_ref = row.get("imageRef", "").strip()
        image_path = images_folder / image_ref if image_ref else None

        clinical_text = (
            f"{row['age']} year old {row['sex']}. "
            f"Tumor Size: {row['tumorSize']}, Grade: {row['tumorGrade']}, "
            f"Type: {row['histologicType']}, MGMT: {row['mgmtStatus']}, "
            f"IDH: {row['idhStatus']}, Surgery: {row['surgery']}"
        )

        print(f"[{i+1}/{len(rows)}] {pid} — embedding...", end=" ", flush=True)
        try:
            vector = embed_with_retry(image_path, clinical_text)
            es.index(index=INDEX, id=pid, document={
                "patientId":      pid,
                "sex":            row["sex"].strip(),
                "age":            int(row["age"]),
                "tumorSize":      row["tumorSize"].strip(),
                "tumorGrade":     row["tumorGrade"].strip(),
                "histologicType": row["histologicType"].strip(),
                "mgmtStatus":     row["mgmtStatus"].strip(),
                "idhStatus":      row["idhStatus"].strip(),
                "surgery":        row["surgery"].strip(),
                "matchPercentage":int(row.get("matchPercentage", 0)),
                "imageRef":       image_ref,
                "clinicalText":   clinical_text,
                "vector":         vector,
            })
            print("✅")
            ok += 1
        except Exception as e:
            print(f"❌ {e}")

    print(f"\n🎉 Done — {ok}/{len(rows)} patients indexed into '{INDEX}'")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk ingest brain MRI patients into Elasticsearch")
    parser.add_argument("--csv",    required=True, help="Path to CSV file")
    parser.add_argument("--images", required=True, help="Folder containing MRI image files")
    args = parser.parse_args()

    print(f"\nConnecting to Elasticsearch at {ES_URL}...")
    if not es.ping():
        print(f"✗ Cannot reach Elasticsearch at {ES_URL}")
        print("  Make sure ES_URL is set in .env and the server is running")
        exit(1)
    print(f"✓ Connected\n")

    ingest_csv(args.csv, args.images)
