import os
import base64
import time
from google import genai
from google.genai import types
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
es = Elasticsearch(os.getenv("ES_URL", "http://localhost:9200"))

def create_index():
    es.indices.create(index="brain_patients", mappings={
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
    }, ignore=400)
    print("Index brain_patients ready.")

def load_image(image_path):
    with open(image_path, "rb") as f:
        return f.read()

def embed_multimodal(image_path, clinical_text, max_retries=5):
    image_bytes = load_image(image_path)
    for attempt in range(max_retries):
        try:
            result = client.models.embed_content(
                model="gemini-embedding-2",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    clinical_text
                ],
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            return result.embeddings[0].values
        except Exception as e:
            if "429" in str(e) or "quota" in str(e).lower() or "rate" in str(e).lower():
                wait = 30 * (attempt + 1)
                print(f"  ⏳ Rate limited — waiting {wait}s (retry {attempt+1}/{max_retries})...")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("Embedding failed after max retries")

patients = [
    {"patientId": "Brain_MRI_020", "sex": "Male",   "age": 48, "tumorSize": "4.5 cm", "tumorGrade": "IV",  "histologicType": "Glioblastoma",        "mgmtStatus": "Unmethylated", "idhStatus": "Wildtype", "surgery": "Yes",         "matchPercentage": 100, "imageRef": "image(20).jpg"},
    {"patientId": "Brain_MRI_039", "sex": "Female", "age": 52, "tumorSize": "5.1 cm", "tumorGrade": "IV",  "histologicType": "Glioblastoma",        "mgmtStatus": "Unmethylated", "idhStatus": "Wildtype", "surgery": "Yes",         "matchPercentage": 98,  "imageRef": "image(39).jpg"},
    {"patientId": "Brain_MRI_021", "sex": "Male",   "age": 45, "tumorSize": "3.8 cm", "tumorGrade": "IV",  "histologicType": "Glioblastoma",        "mgmtStatus": "Unmethylated", "idhStatus": "Mutant",   "surgery": "Biopsy Only", "matchPercentage": 95,  "imageRef": "image(21).jpg"},
    {"patientId": "Brain_MRI_040", "sex": "Female", "age": 58, "tumorSize": "6.0 cm", "tumorGrade": "IV",  "histologicType": "Glioblastoma",        "mgmtStatus": "Methylated",   "idhStatus": "Wildtype", "surgery": "No",          "matchPercentage": 88,  "imageRef": "image(40).jpg"},
    {"patientId": "Brain_MRI_028", "sex": "Female", "age": 41, "tumorSize": "4.2 cm", "tumorGrade": "IV",  "histologicType": "Glioblastoma",        "mgmtStatus": "Methylated",   "idhStatus": "Mutant",   "surgery": "Yes",         "matchPercentage": 85,  "imageRef": "image(28).jpg"},
    {"patientId": "Brain_MRI_034", "sex": "Male",   "age": 65, "tumorSize": "3.5 cm", "tumorGrade": "IV",  "histologicType": "Glioblastoma",        "mgmtStatus": "Unmethylated", "idhStatus": "Wildtype", "surgery": "Yes",         "matchPercentage": 75,  "imageRef": "image(34).jpg"},
    {"patientId": "Brain_MRI_024", "sex": "Female", "age": 38, "tumorSize": "2.0 cm", "tumorGrade": "III", "histologicType": "Anaplastic Astrocytoma","mgmtStatus": "Methylated", "idhStatus": "Mutant",   "surgery": "Biopsy Only", "matchPercentage": 60,  "imageRef": "image(24).jpg"},
    {"patientId": "Brain_MRI_036", "sex": "Male",   "age": 50, "tumorSize": "1.2 cm", "tumorGrade": "IV",  "histologicType": "Glioblastoma",        "mgmtStatus": "Unmethylated", "idhStatus": "Wildtype", "surgery": "No",          "matchPercentage": 50,  "imageRef": "image(36).jpg"},
    {"patientId": "Brain_MRI_027", "sex": "Female", "age": 35, "tumorSize": "5.5 cm", "tumorGrade": "II",  "histologicType": "Oligodendroglioma",   "mgmtStatus": "Methylated",   "idhStatus": "Mutant",   "surgery": "Yes",         "matchPercentage": 40,  "imageRef": "image(27).jpg"},
    {"patientId": "Brain_MRI_003", "sex": "Male",   "age": 28, "tumorSize": "6.5 cm", "tumorGrade": "II",  "histologicType": "Diffuse Astrocytoma", "mgmtStatus": "N/A",          "idhStatus": "Mutant",   "surgery": "Biopsy Only", "matchPercentage": 15,  "imageRef": "image(3).jpg"},
]

IMAGE_FOLDER = r"C:\Users\ELCOT\Documents\mcp\brain"

if __name__ == "__main__":
    create_index()

    for i, p in enumerate(patients):
        image_path = os.path.join(IMAGE_FOLDER, p["imageRef"])
        clinical_text = f"{p['age']} year old {p['sex']}. Tumor Size: {p['tumorSize']}, Grade: {p['tumorGrade']}, Type: {p['histologicType']}, MGMT: {p['mgmtStatus']}, IDH: {p['idhStatus']}, Surgery: {p['surgery']}"

        print(f"Processing {p['patientId']}...")
        vector = embed_multimodal(image_path, clinical_text)

        es.index(index="brain_patients", id=p["patientId"], document={
            **p,
            "clinicalText": clinical_text,
            "vector": vector
        })
        print(f"✅ Indexed: {p['patientId']}")

        if i < len(patients) - 1:
            time.sleep(1)

    print("\n🎉 All 10 patients indexed into Elastic Cloud!")