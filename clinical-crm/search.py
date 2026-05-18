import os
from google import genai
from google.genai import types
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
es = Elasticsearch(
    os.getenv("ELASTIC_URL"),
    api_key=os.getenv("ELASTIC_API_KEY")
)

def embed(text):
    result = client.models.embed_content(
        model="gemini-embedding-2",
        contents=f"task: search result | query: {text}",
        config=types.EmbedContentConfig(output_dimensionality=768)
    )
    return result.embeddings[0].values

def search_trials(patient_query, patient_age):
    query_vector = embed(patient_query)
    results = es.search(index="clinical_trials", body={
        "query": {
            "bool": {
                "must": [{"match": {"description": patient_query}}],
                "filter": [
                    {"range": {"age_min": {"lte": patient_age}}},
                    {"range": {"age_max": {"gte": patient_age}}}
                ]
            }
        },
        "knn": {
            "field": "vector",
            "query_vector": query_vector,
            "k": 3,
            "num_candidates": 10
        }
    })
    return results["hits"]["hits"]

def synthesize(patient_query, trials):
    context = "\n\n".join([
        f"Trial: {t['_source']['title']}\n{t['_source']['description']}"
        for t in trials
    ])
    prompt = f"""You are a clinical trial matching assistant.
Patient Query: {patient_query}
Matched Trials:
{context}
Write a short professional summary explaining why this patient may be eligible."""

    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )
    return response.text

if __name__ == "__main__":
    query = "breast cancer HER2 positive treatment"
    age = 45
    print(f"Searching for: {query}, Age: {age}\n")
    results = search_trials(query, age)
    summary = synthesize(query, results)
    print(summary)