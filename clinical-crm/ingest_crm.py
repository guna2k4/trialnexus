import csv
import os
from google import genai
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
es = Elasticsearch(
    os.getenv("ELASTIC_URL"),
    api_key=os.getenv("ELASTIC_API_KEY")
)


def create_index():
    es.indices.create(
        index="clinical_trial_crm",
        mappings={
            "properties": {
                "site_id":                 {"type": "keyword"},
                "state":                   {"type": "keyword"},
                "target_enrollment":       {"type": "integer"},
                "actual_enrollment":       {"type": "integer"},
                "dropout_rate_percentage": {"type": "integer"},
                "field_notes":             {"type": "text"},
                "risk_level":              {"type": "keyword"},
                "enrollment_percentage":   {"type": "float"},
            }
        },
        ignore=400
    )
    print("Index clinical_trial_crm ready.")


def classify_risk(field_notes: str, dropout_rate: int, enrollment_pct: float) -> str:
    prompt = (
        "Classify this clinical trial site risk as exactly one word: High, Medium, or Low.\n"
        f"Field Notes: {field_notes}\n"
        f"Dropout Rate: {dropout_rate}%\n"
        f"Enrollment Achievement: {enrollment_pct:.0f}%\n"
        "Reply with only: High, Medium, or Low"
    )
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=prompt
        )
        risk = response.text.strip().capitalize()
        if risk not in ("High", "Medium", "Low"):
            raise ValueError("unexpected response")
        return risk
    except Exception:
        # Fallback: derive from numbers
        if enrollment_pct < 60 or dropout_rate > 30:
            return "High"
        elif enrollment_pct < 85 or dropout_rate > 20:
            return "Medium"
        return "Low"


if __name__ == "__main__":
    create_index()

    csv_path = os.path.join(os.path.dirname(__file__), "clinical_trial_crm_data.csv")
    if not os.path.exists(csv_path):
        print("ERROR: clinical_trial_crm_data.csv not found.")
        print("Run generate_crm_data.py first.")
        exit(1)

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    total = len(rows)
    for i, row in enumerate(rows):
        target  = int(row["target_enrollment"])
        actual  = int(row["actual_enrollment"])
        dropout = int(row["dropout_rate_percentage"])
        enrollment_pct = round((actual / target * 100) if target > 0 else 0, 1)

        risk = classify_risk(row["field_notes"], dropout, enrollment_pct)

        doc = {
            "site_id":                 row["site_id"],
            "state":                   row["state"],
            "target_enrollment":       target,
            "actual_enrollment":       actual,
            "dropout_rate_percentage": dropout,
            "field_notes":             row["field_notes"],
            "risk_level":              risk,
            "enrollment_percentage":   enrollment_pct,
        }

        es.index(index="clinical_trial_crm", id=row["site_id"], document=doc)
        print(f"[{i+1}/{total}] {row['site_id']} ({row['state']}) → {enrollment_pct:.0f}% enrolled | Risk: {risk}")

    print(f"\nDone! {total} sites indexed into clinical_trial_crm.")
