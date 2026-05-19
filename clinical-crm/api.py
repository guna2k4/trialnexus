import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google import genai
from google.genai import types
from elasticsearch import Elasticsearch
from dotenv import load_dotenv
from openai import OpenAI as _OpenAI
import uvicorn

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

_ES_INDICES = ["brain_patients", "clinical_trial_crm", "patients", "commercial_signals"]

def _wait_for_es(max_seconds=180):
    """Block until local ES is accepting connections."""
    import time
    deadline = time.time() + max_seconds
    while time.time() < deadline:
        try:
            es.cluster.health(wait_for_status="yellow", timeout="5s")
            print("[ES] local Elasticsearch ready")
            return True
        except Exception:
            print("[ES] waiting for Elasticsearch…")
            time.sleep(5)
    print("[ES] WARNING: Elasticsearch did not become ready in time")
    return False

def _migrate_es_from_cloud():
    """One-time migration: copy all indices from Elastic Cloud to local ES."""
    if not _wait_for_es():
        return
    cloud_url = os.getenv("ELASTIC_URL", "")
    cloud_key  = os.getenv("ELASTIC_API_KEY", "")
    if not cloud_url or not cloud_key:
        print("[ES] No cloud credentials — skipping migration")
        return

    cloud_es = Elasticsearch(cloud_url, api_key=cloud_key)

    for idx in _ES_INDICES:
        # Skip if local already has data
        try:
            if es.indices.exists(index=idx):
                count = es.count(index=idx)["count"]
                if count > 0:
                    print(f"[ES] {idx}: {count} docs already local — skip")
                    continue
        except Exception:
            pass

        # Copy mapping from cloud then create local index
        try:
            mapping_resp = cloud_es.indices.get_mapping(index=idx)
            mapping = mapping_resp[idx]["mappings"]
            if es.indices.exists(index=idx):
                es.indices.delete(index=idx)
            es.indices.create(index=idx, mappings=mapping)
            print(f"[ES] {idx}: index created with cloud mapping")
        except Exception as exc:
            print(f"[ES] {idx}: mapping copy failed — {exc}")
            continue

        # Reindex from remote
        try:
            print(f"[ES] {idx}: pulling from Elastic Cloud…")
            result = es.reindex(
                body={
                    "source": {
                        "remote": {
                            "host": cloud_url,
                            "headers": {"Authorization": f"ApiKey {cloud_key}"},
                        },
                        "index": idx,
                        "size": 100,
                    },
                    "dest": {"index": idx},
                },
                wait_for_completion=True,
                request_timeout=300,
            )
            print(f"[ES] {idx}: ✓ {result.get('created', 0)} docs migrated")
        except Exception as exc:
            print(f"[ES] {idx}: reindex failed — {exc}")

# ── Build patients.db + migrate ES on startup ──────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        import sys
        agent_dir = os.path.join(os.path.dirname(__file__), "agent")
        sys.path.insert(0, agent_dir)
        db_path = os.path.join(agent_dir, "patients.db")
        if not os.path.exists(db_path):
            from setup_db import build as build_db
            build_db()
        print("[startup] patients.db ready")
    except Exception as e:
        print(f"[startup] WARNING: could not build patients.db — {e}")

    try:
        import asyncio
        await asyncio.to_thread(_migrate_es_from_cloud)
    except Exception as e:
        print(f"[startup] WARNING: ES migration error — {e}")

    yield

app = FastAPI(title="Clinical Trial Patient Matching API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve brain MRI images at /images/<filename>
BRAIN_IMAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "brain")
app.mount("/images", StaticFiles(directory=BRAIN_IMAGE_DIR), name="images")

gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Featherless — used for commercial intelligence synthesis + report generation
_featherless = _OpenAI(
    api_key=os.getenv("FEATHERLESS_API_KEY", ""),
    base_url="https://api.featherless.ai/v1",
)
_FL_MODEL = "Qwen/Qwen2.5-72B-Instruct"

import threading as _threading

def _fl_think_strip(text: str, state: dict) -> str:
    """Strip <think>...</think> blocks that Qwen3 emits before the real answer."""
    out = ""
    i = 0
    while i < len(text):
        if not state["in_think"]:
            start = text.find("<think>", i)
            if start == -1:
                out += text[i:]; break
            out += text[i:start]
            state["in_think"] = True
            i = start + 7
        else:
            end = text.find("</think>", i)
            if end == -1:
                i = len(text); break
            state["in_think"] = False
            i = end + 8
    return out

async def _fl_stream(messages: list, max_tokens: int):
    """Yield tokens from Featherless without blocking the async event loop."""
    import asyncio as _aio
    loop = _aio.get_event_loop()
    queue: _aio.Queue = _aio.Queue()

    def _produce():
        try:
            stream = _featherless.chat.completions.create(
                model=_FL_MODEL,
                messages=messages,
                stream=True,
                max_tokens=max_tokens,
                extra_body={"thinking": False},
            )
            for chunk in stream:
                tok = (chunk.choices[0].delta.content or "") if chunk.choices else ""
                if tok:
                    loop.call_soon_threadsafe(queue.put_nowait, tok)
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, exc)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    _threading.Thread(target=_produce, daemon=True).start()
    think_state = {"in_think": False}
    while True:
        item = await queue.get()
        if item is None:
            break
        if isinstance(item, Exception):
            raise item
        clean = _fl_think_strip(item, think_state)
        if clean:
            yield clean
es = Elasticsearch("http://elasticsearch:9200")


def embed_multimodal(image_bytes: bytes, query_text: str) -> list[float]:
    result = gemini_client.models.embed_content(
        model="gemini-embedding-2",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            query_text,
        ],
        config=types.EmbedContentConfig(output_dimensionality=768),
    )
    return result.embeddings[0].values



@app.post("/search")
async def search_patients(
    file: UploadFile = File(...),
    query: str = Form(...),
    age: int = Form(default=0),
):
    image_bytes = await file.read()

    query_vector = embed_multimodal(image_bytes, query)

    # Strict demographic filters applied directly to kNN so vector search
    # only runs against patients that pass the filter
    filters = []
    query_lower = query.lower()
    if "female" in query_lower:
        filters.append({"term": {"sex": "Female"}})
    elif "male" in query_lower:
        filters.append({"term": {"sex": "Male"}})
    if age > 0:
        filters.append({"range": {"age": {"gte": max(0, age - 10), "lte": age + 10}}})

    knn_clause = {
        "field": "vector",
        "query_vector": query_vector,
        "k": 5,
        "num_candidates": 10,
    }
    if filters:
        knn_clause["filter"] = {"bool": {"must": filters}}

    response = es.search(index="brain_patients", body={"knn": knn_clause})

    patients = []
    for hit in response["hits"]["hits"]:
        src = hit["_source"]
        image_ref = src.get("imageRef", "")
        patients.append({
            "patientId":      src.get("patientId", hit["_id"]),
            "sex":            src.get("sex", ""),
            "age":            src.get("age", 0),
            "tumorSize":      src.get("tumorSize", ""),
            "tumorGrade":     src.get("tumorGrade", ""),
            "histologicType": src.get("histologicType", ""),
            "mgmtStatus":     src.get("mgmtStatus", ""),
            "idhStatus":      src.get("idhStatus", ""),
            "surgery":        src.get("surgery", ""),
            "matchPercentage":src.get("matchPercentage", 0),
            "imageRef":       image_ref,
            "imageUrl":       f"/api/images/{image_ref}" if image_ref else "",
            "clinicalText":   src.get("clinicalText", ""),
            "score":          round(float(hit["_score"]), 4),
        })

    return JSONResponse(content={"results": patients, "total": len(patients)})


@app.get("/patients")
def get_all_patients():
    response = es.search(
        index="brain_patients",
        body={"query": {"match_all": {}}, "size": 100},
    )
    patients = []
    for hit in response["hits"]["hits"]:
        src = hit["_source"]
        image_ref = src.get("imageRef", "")
        patients.append({
            "patientId":      src.get("patientId", hit["_id"]),
            "sex":            src.get("sex", ""),
            "age":            src.get("age", 0),
            "tumorSize":      src.get("tumorSize", ""),
            "tumorGrade":     src.get("tumorGrade", ""),
            "histologicType": src.get("histologicType", ""),
            "mgmtStatus":     src.get("mgmtStatus", ""),
            "idhStatus":      src.get("idhStatus", ""),
            "surgery":        src.get("surgery", ""),
            "matchPercentage":src.get("matchPercentage", 0),
            "imageRef":       image_ref,
            "imageUrl":       f"/api/images/{image_ref}" if image_ref else "",
            "clinicalText":   src.get("clinicalText", ""),
        })
    return JSONResponse(content={"patients": patients, "total": len(patients)})


# ── CRM endpoints ────────────────────────────────────────────

STATE_NAMES = {
    "texas": "TX", "new york": "NY", "california": "CA",
    "florida": "FL", "illinois": "IL", "pennsylvania": "PA",
    "ohio": "OH", "georgia": "GA", "north carolina": "NC",
    "michigan": "MI", "washington": "WA", "massachusetts": "MA",
}


@app.get("/crm/sites")
def crm_get_sites(state: str = None):
    """Return all CRM sites, optionally filtered by state."""
    if state:
        body = {"query": {"term": {"state": state.upper()}}, "size": 200}
    else:
        body = {"query": {"match_all": {}}, "size": 200}

    response = es.search(index="clinical_trial_crm", body=body)
    sites = []
    for hit in response["hits"]["hits"]:
        src = hit["_source"]
        sites.append({
            "site_id":                 src.get("site_id", hit["_id"]),
            "state":                   src.get("state", ""),
            "target_enrollment":       src.get("target_enrollment", 0),
            "actual_enrollment":       src.get("actual_enrollment", 0),
            "dropout_rate_percentage": src.get("dropout_rate_percentage", 0),
            "enrollment_percentage":   src.get("enrollment_percentage", 0),
            "field_notes":             src.get("field_notes", ""),
            "risk_level":              src.get("risk_level", ""),
        })
    return JSONResponse(content={"sites": sites, "total": len(sites)})


@app.get("/crm/states")
def crm_get_states():
    """Return per-state aggregated stats."""
    response = es.search(
        index="clinical_trial_crm",
        body={
            "size": 0,
            "aggs": {
                "by_state": {
                    "terms": {"field": "state", "size": 50},
                    "aggs": {
                        "avg_enrollment":  {"avg":          {"field": "enrollment_percentage"}},
                        "avg_dropout":     {"avg":          {"field": "dropout_rate_percentage"}},
                        "high_risk":       {"filter":       {"term": {"risk_level": "High"}}},
                        "medium_risk":     {"filter":       {"term": {"risk_level": "Medium"}}},
                        "low_risk":        {"filter":       {"term": {"risk_level": "Low"}}},
                        "total_target":    {"sum":          {"field": "target_enrollment"}},
                        "total_actual":    {"sum":          {"field": "actual_enrollment"}},
                    },
                }
            },
        },
    )

    states = []
    for bucket in response["aggregations"]["by_state"]["buckets"]:
        high   = bucket["high_risk"]["doc_count"]
        medium = bucket["medium_risk"]["doc_count"]
        low    = bucket["low_risk"]["doc_count"]
        total  = bucket["doc_count"]
        states.append({
            "state":             bucket["key"],
            "total_sites":       total,
            "avg_enrollment_pct": round(bucket["avg_enrollment"]["value"] or 0, 1),
            "avg_dropout_pct":    round(bucket["avg_dropout"]["value"] or 0, 1),
            "high_risk":         high,
            "medium_risk":       medium,
            "low_risk":          low,
            "total_target":      int(bucket["total_target"]["value"] or 0),
            "total_actual":      int(bucket["total_actual"]["value"] or 0),
        })
    states.sort(key=lambda x: x["avg_enrollment_pct"])
    return JSONResponse(content={"states": states})


class ChatRequest(BaseModel):
    question: str


# ── Control Tower endpoints ───────────────────────────────────

MONTHLY_TRENDS = [
    {"month": "Jun 24", "enrollment": 412, "dropout": 58},
    {"month": "Jul 24", "enrollment": 438, "dropout": 52},
    {"month": "Aug 24", "enrollment": 455, "dropout": 61},
    {"month": "Sep 24", "enrollment": 441, "dropout": 49},
    {"month": "Oct 24", "enrollment": 467, "dropout": 55},
    {"month": "Nov 24", "enrollment": 489, "dropout": 48},
    {"month": "Dec 24", "enrollment": 472, "dropout": 63},
    {"month": "Jan 25", "enrollment": 501, "dropout": 44},
    {"month": "Feb 25", "enrollment": 518, "dropout": 51},
    {"month": "Mar 25", "enrollment": 534, "dropout": 47},
    {"month": "Apr 25", "enrollment": 521, "dropout": 58},
    {"month": "May 25", "enrollment": 548, "dropout": 42},
]


@app.get("/api/dashboard-data")
def get_dashboard_data():
    """Aggregate KPIs and state enrollment from clinical_trial_crm index."""
    result = es.search(
        index="clinical_trial_crm",
        body={
            "size": 0,
            "aggs": {
                "avg_enrollment": {"avg":          {"field": "enrollment_percentage"}},
                "avg_dropout":    {"avg":          {"field": "dropout_rate_percentage"}},
                "by_state": {
                    "terms": {"field": "state", "size": 50},
                    "aggs": {
                        "avg_enrollment": {"avg":          {"field": "enrollment_percentage"}},
                        "total_sites":    {"value_count":  {"field": "site_id"}},
                        "high_risk":      {"filter":       {"term": {"risk_level": "High"}}},
                    },
                },
            },
        },
    )

    aggs       = result["aggregations"]
    total_sites = result["hits"]["total"]["value"]

    avg_enrollment = round(aggs["avg_enrollment"]["value"] or 0, 1)
    avg_dropout    = round(aggs["avg_dropout"]["value"]    or 0, 1)

    # Site activation rate = % of sites with enrollment_percentage >= 50
    active_res = es.search(
        index="clinical_trial_crm",
        body={"size": 0, "query": {"range": {"enrollment_percentage": {"gte": 50}}}},
    )
    active_count         = active_res["hits"]["total"]["value"]
    site_activation_rate = round((active_count / total_sites * 100) if total_sites else 0, 1)

    state_enrollment = [
        {
            "state":               b["key"],
            "avg_enrollment_pct":  round(b["avg_enrollment"]["value"] or 0, 1),
            "total_sites":         b["total_sites"]["value"],
            "high_risk":           b["high_risk"]["doc_count"],
        }
        for b in aggs["by_state"]["buckets"]
    ]

    return JSONResponse(content={
        "kpis": {
            "active_trials":        12,
            "avg_enrollment_rate":  avg_enrollment,
            "site_activation_rate": site_activation_rate,
            "avg_dropout_rate":     avg_dropout,
        },
        "state_enrollment": state_enrollment,
        "monthly_trends":   MONTHLY_TRENDS,
    })


class DashboardChatRequest(BaseModel):
    user_message:      str
    dashboard_context: dict


@app.post("/api/chat")
def api_chat(req: DashboardChatRequest):
    """Answer a natural-language question using dashboard KPIs + Gemini."""
    context_str = "\n".join(f"{k}: {v}" for k, v in req.dashboard_context.items())
    prompt = (
        "You are a clinical trial operations AI analyst. "
        "Answer the user's question based on the dashboard KPIs. "
        "Be concise and actionable — 2 to 4 sentences.\n\n"
        f"Dashboard KPIs:\n{context_str}\n\n"
        f"Question: {req.user_message}"
    )
    response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
    )
    return JSONResponse(content={"answer": response.text.strip()})


@app.post("/crm/chat")
def crm_chat(req: ChatRequest):
    """Answer a natural-language question about CRM site performance."""
    q_lower = req.question.lower()

    # Detect state mention
    target_state = None
    for name, abbr in STATE_NAMES.items():
        if name in q_lower or abbr.lower() in q_lower:
            target_state = abbr
            break

    if target_state:
        body = {"query": {"term": {"state": target_state}}, "size": 100}
    else:
        body = {"query": {"match_all": {}}, "size": 200}

    response = es.search(index="clinical_trial_crm", body=body)
    sites = [hit["_source"] for hit in response["hits"]["hits"]]

    context = "\n".join([
        f"{s['site_id']} ({s['state']}): "
        f"Enrolled {s['actual_enrollment']}/{s['target_enrollment']} "
        f"({s['enrollment_percentage']}%), Dropout {s['dropout_rate_percentage']}%, "
        f"Risk: {s['risk_level']}. Notes: {s['field_notes']}"
        for s in sites
    ])

    prompt = (
        "You are a clinical trial operations analyst. "
        "Answer the question below using only the site data provided. "
        "Be concise and specific — 3 to 5 sentences.\n\n"
        f"Question: {req.question}\n\n"
        f"Site Data:\n{context}"
    )

    ai_response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
    )
    return JSONResponse(content={
        "answer":         ai_response.text.strip(),
        "sites_analyzed": len(sites),
        "state_filter":   target_state,
    })


# ── Clinical patients endpoints (new patients index) ─────────

@app.get("/api/patients/dashboard")
def patients_dashboard():
    """
    Aggregate KPIs from the 'patients' ES index:
    enrollment rates, dropout risk, trial breakdown, state map data.
    """
    result = es.search(
        index="patients",
        body={
            "size": 0,
            "aggs": {
                "avg_enrollment":    { "avg":   { "field": "enrollment_rate"   } },
                "avg_site_health":   { "avg":   { "field": "site_health_score" } },
                "high_dropout":      { "filter":{ "term": { "dropout_risk": "High" } } },
                "by_trial": {
                    "terms": { "field": "trial_id", "size": 20 },
                    "aggs": {
                        "avg_enrollment": { "avg": { "field": "enrollment_rate"   } },
                        "avg_health":     { "avg": { "field": "site_health_score" } },
                        "patient_count":  { "value_count": { "field": "patient_id" } },
                    }
                },
                "by_state": {
                    "terms": { "field": "state", "size": 60 },
                    "aggs": {
                        "avg_enrollment": { "avg": { "field": "enrollment_rate" } },
                        "high_risk_count":{ "filter": { "term": { "dropout_risk": "High" } } },
                    }
                },
                "by_status": {
                    "terms": { "field": "enrollment_status", "size": 10 }
                },
            }
        }
    )

    total   = result["hits"]["total"]["value"]
    aggs    = result["aggregations"]

    trials = [
        {
            "trial_id":      b["key"],
            "patient_count": b["patient_count"]["value"],
            "avg_enrollment": round(b["avg_enrollment"]["value"] or 0, 1),
            "avg_health":    round(b["avg_health"]["value"] or 0, 1),
        }
        for b in aggs["by_trial"]["buckets"]
    ]

    state_data = [
        {
            "state":          b["key"],
            "patient_count":  b["doc_count"],
            "avg_enrollment": round(b["avg_enrollment"]["value"] or 0, 1),
            "high_risk":      b["high_risk_count"]["doc_count"],
        }
        for b in aggs["by_state"]["buckets"]
    ]

    status_dist = { b["key"]: b["doc_count"] for b in aggs["by_status"]["buckets"] }

    return JSONResponse(content={
        "total_patients":     total,
        "avg_enrollment_rate": round(aggs["avg_enrollment"]["value"] or 0, 1),
        "avg_site_health":    round(aggs["avg_site_health"]["value"] or 0, 1),
        "high_dropout_count": aggs["high_dropout"]["doc_count"],
        "trials":             trials,
        "state_data":         state_data,
        "enrollment_status":  status_dist,
    })


class CohortSearchRequest(BaseModel):
    query:  str
    state:  str = ""
    trial:  str = ""
    gender: str = ""
    top_k:  int = 5


@app.post("/api/cohort-search")
def cohort_search(req: CohortSearchRequest):
    """
    Hybrid kNN + lexical search over the 'patients' index.
    Embeds the user's query via Gemini then applies demographic/state filters.
    """
    query_vector = embed_multimodal(b"", req.query) if not req.query else None

    # Text-only embedding for cohort search
    result = gemini_client.models.embed_content(
        model="gemini-embedding-2",
        contents=req.query,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )
    query_vector = result.embeddings[0].values

    # Build filters
    filters = []
    if req.state:
        filters.append({ "term": { "state": req.state.upper() } })
    if req.trial:
        filters.append({ "term": { "trial_id": req.trial.upper() } })
    if req.gender.lower() in ("male", "female"):
        filters.append({ "term": { "gender": req.gender.capitalize() } })

    knn_clause = {
        "field": "embedding",
        "query_vector": query_vector,
        "k": req.top_k,
        "num_candidates": req.top_k * 3,
    }
    if filters:
        knn_clause["filter"] = { "bool": { "must": filters } }

    response = es.search(index="patients", body={"knn": knn_clause})

    patients = []
    for hit in response["hits"]["hits"]:
        src = hit["_source"]
        patients.append({
            "patient_id":        src.get("patient_id"),
            "trial_id":          src.get("trial_id"),
            "trial_phase":       src.get("trial_phase"),
            "state":             src.get("state"),
            "age":               src.get("age"),
            "gender":            src.get("gender"),
            "eGFR":              src.get("eGFR"),
            "dropout_risk":      src.get("dropout_risk"),
            "enrollment_status": src.get("enrollment_status"),
            "site_health_score": src.get("site_health_score"),
            "enrollment_rate":   src.get("enrollment_rate"),
            "clinical_notes":    src.get("clinical_notes"),
            "image_url": f"/api/images/{src['image_path']}" if src.get("image_path") else "",
            "similarity_score":  round(float(hit["_score"]), 4),
        })

    return JSONResponse(content={ "results": patients, "total": len(patients) })


# ── Commercial signals chat endpoint ─────────────────────────

class CommercialChatRequest(BaseModel):
    question: str
    state:    str = ""


@app.post("/commercial/chat")
def commercial_chat(req: CommercialChatRequest):
    """
    RAG over commercial_signals index.
    Embeds the question, retrieves top signals via kNN, answers with Gemini.
    Returns the answer + source metadata (YouTube URLs, authors, sentiment).
    """
    # Embed the question
    emb_result = gemini_client.models.embed_content(
        model="gemini-embedding-2",
        contents=req.question,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )
    query_vector = emb_result.embeddings[0].values

    # Optional state filter
    knn_clause = {
        "field": "embedding",
        "query_vector": query_vector,
        "k": 4,
        "num_candidates": 15,
    }
    if req.state:
        knn_clause["filter"] = { "term": { "state": req.state.upper() } }

    response = es.search(index="commercial_signals", body={"knn": knn_clause})

    sources  = []
    context_parts = []
    for hit in response["hits"]["hits"]:
        src = hit["_source"]
        sources.append({
            "signal_id":   src.get("signal_id"),
            "title":       src.get("title"),
            "author":      src.get("author"),
            "url":         src.get("url"),
            "source_type": src.get("source_type"),
            "sentiment":   src.get("sentiment"),
            "topic":       src.get("topic"),
            "state":       src.get("state"),
            "date":        src.get("date"),
        })
        context_parts.append(
            f"[{src['source_type']} | {src['sentiment']} | {src['state']} | {src['date']}]\n"
            f"Author: {src['author']}\n"
            f"Topic: {src['topic']}\n"
            f"Content: {src['transcript'][:600]}"
        )

    context = "\n\n---\n\n".join(context_parts)
    prompt  = (
        "You are a pharmaceutical commercial intelligence analyst. "
        "Answer the question using only the signal data provided below. "
        "Be specific about regions, sentiments, and competitor mentions. "
        "Keep it to 3–5 sentences.\n\n"
        f"Question: {req.question}\n\n"
        f"Signal Data:\n{context}"
    )

    ai_response = gemini_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
    )

    return JSONResponse(content={
        "answer":  ai_response.text.strip(),
        "sources": sources,
    })


# ── Patient Screening (Agent gatekeeper results) ─────────────

import sqlite3 as _sqlite3
import asyncio as _asyncio
import json    as _json
from pathlib import Path as _Path
from fastapi.responses import StreamingResponse

AGENT_DB  = _Path(__file__).parent / "agent" / "patients.db"
AGENT_DIR = _Path(__file__).parent / "agent"

import sys as _sys
_sys.path.insert(0, str(AGENT_DIR))
import agent_engine as _agent_mod

# Cache: persisted to disk so server restarts don't re-call Gemini
_SQL_CACHE_FILE = AGENT_DIR / "sql_cache.json"
_SQL_CACHE: dict | None = None

def _load_sql_cache():
    global _SQL_CACHE
    if _SQL_CACHE_FILE.exists():
        try:
            _SQL_CACHE = _json.loads(_SQL_CACHE_FILE.read_text())
            print("[startup] SQL cache loaded from disk — Gemini agents will be skipped")
        except Exception:
            _SQL_CACHE = None

_load_sql_cache()

# Per-rule checks — mirrors the approved SQL from agent_engine.py
_RULES = [
    {
        "id": "EX-01", "lookback": 180,
        "desc": "Prior chemotherapy within 180 days",
        "etype": "medication",
        "names": ["Chemotherapy","Temozolomide","Carboplatin","Bevacizumab","Lomustine"],
    },
    {
        "id": "EX-02", "lookback": 10,
        "desc": "Aspirin or anticoagulant within 10 days",
        "etype": "medication",
        "names": ["Aspirin","Warfarin","Heparin","Rivaroxaban","Apixaban","Clopidogrel"],
    },
    {
        "id": "EX-03", "lookback": 180,
        "desc": "Myocardial infarction within 180 days",
        "etype": "diagnosis",
        "names": ["Myocardial Infarction","Heart Attack","STEMI","NSTEMI"],
    },
    {
        "id": "EX-04", "lookback": 30,
        "desc": "Active seizure medication within 30 days",
        "etype": "medication",
        "names": ["Levetiracetam","Phenytoin","Valproate","Carbamazepine","Lamotrigine","Lacosamide"],
    },
    {
        "id": "EX-06", "lookback": 180,
        "desc": "Radiotherapy within 180 days",
        "etype": "procedure",
        "names": ["Radiotherapy IMRT","Radiotherapy","Proton Beam Therapy","Stereotactic Radiosurgery","Whole Brain Radiation","IMRT"],
    },
    {
        "id": "EX-07", "lookback": 180,
        "desc": "Immunotherapy within 180 days",
        "etype": "medication",
        "names": ["Immunotherapy","Pembrolizumab","Nivolumab","Atezolizumab","Durvalumab"],
    },
]


def _check_rule(cur, patient_id: str, rule: dict):
    placeholders = ",".join("?" * len(rule["names"]))
    row = cur.execute(
        f"SELECT event_name, days_ago FROM patient_history "
        f"WHERE patient_id=? AND event_type=? AND event_name IN ({placeholders}) "
        f"AND days_ago <= ? LIMIT 1",
        [patient_id, rule["etype"]] + rule["names"] + [rule["lookback"]],
    ).fetchone()
    return row  # None = passed, row = violated


def _enrich_patient(events):
    """Extract primary_diagnosis, comorbidities, and days_since_last_visit from event rows."""
    diagnoses = [e["event_name"] for e in events if e["event_type"] == "diagnosis"]
    primary   = diagnoses[0] if diagnoses else "Unknown"
    comorbidities = diagnoses[1:] if len(diagnoses) > 1 else []
    days_ago_values = [e["days_ago"] for e in events]
    days_since_last = min(days_ago_values) if days_ago_values else None
    return primary, comorbidities, days_since_last


@app.get("/api/screening")
def get_screening(trial: str = ""):
    if not AGENT_DB.exists():
        return JSONResponse(
            status_code=404,
            content={"error": "patients.db not found. Run: cd agent && python setup_db.py"}
        )

    conn = _sqlite3.connect(str(AGENT_DB))
    conn.row_factory = _sqlite3.Row
    cur  = conn.cursor()

    if trial:
        rows = cur.execute(
            "SELECT * FROM patients WHERE trial_id=? ORDER BY patient_id", (trial.upper(),)
        ).fetchall()
    else:
        rows = cur.execute("SELECT * FROM patients ORDER BY patient_id").fetchall()

    result = []

    for p in rows:
        pid    = p["patient_id"]
        events = cur.execute(
            "SELECT event_type, event_name, days_ago FROM patient_history "
            "WHERE patient_id=? ORDER BY days_ago DESC", (pid,)
        ).fetchall()

        excluded_rules = []
        passed_rules   = []

        # EX-05 — age
        if p["age"] < 18 or p["age"] > 75:
            excluded_rules.append({
                "rule_id": "EX-05",
                "description": "Age outside 18–75 years",
                "evidence": f"Age {p['age']}",
            })
        else:
            passed_rules.append({
                "rule_id": "EX-05",
                "description": "Age within 18–75 years",
                "evidence": f"Age {p['age']}",
            })

        # Event-based rules
        for rule in _RULES:
            hit = _check_rule(cur, pid, rule)
            if hit:
                excluded_rules.append({
                    "rule_id":    rule["id"],
                    "description": rule["desc"],
                    "evidence":   f"{hit['event_name']} ({hit['days_ago']} days ago)",
                })
            else:
                passed_rules.append({
                    "rule_id":    rule["id"],
                    "description": rule["desc"],
                    "evidence":   "No violation found",
                })

        primary, comorbidities, days_since_last = _enrich_patient(events)

        result.append({
            "patient_id":          pid,
            "age":                 p["age"],
            "gender":              p["gender"],
            "trial_id":            p["trial_id"],
            "state":               p["state"],
            "screening_status":    "EXCLUDED" if excluded_rules else "PRE_QUALIFIED",
            "primary_diagnosis":   primary,
            "comorbidities":       comorbidities,
            "days_since_last_visit": days_since_last,
            "excluded_rules":      excluded_rules,
            "passed_rules":        passed_rules,
            "events": [
                {"event_type": e["event_type"], "event_name": e["event_name"], "days_ago": e["days_ago"]}
                for e in events
            ],
        })

    conn.close()
    excluded  = sum(1 for p in result if p["screening_status"] == "EXCLUDED")
    qualified = len(result) - excluded

    return JSONResponse(content={
        "patients": result,
        "trial":    trial.upper() if trial else "ALL",
        "summary":  {"total": len(result), "excluded": excluded, "pre_qualified": qualified},
    })


# ── CSV import pipeline ───────────────────────────────────────

import csv as _csv
import io  as _io

class ImportResult(BaseModel):
    patients_added: int
    events_added:   int
    skipped:        list[str]
    errors:         list[str]


@app.post("/api/import/patients")
async def import_patients_csv(
    patients_csv: UploadFile = File(..., description="CSV: patient_id,age,gender,trial_id,state"),
    events_csv:   UploadFile = File(None, description="CSV: patient_id,event_type,event_name,days_ago"),
):
    """
    Upload patients.csv and (optionally) events.csv to extend the screening DB.
    Existing patient_ids are skipped (no upsert — append only).

    patients.csv columns: patient_id, age, gender, trial_id, state
    events.csv columns  : patient_id, event_type, event_name, days_ago
    """
    if not AGENT_DB.exists():
        return JSONResponse(status_code=404, content={"error": "patients.db not found — run setup first"})

    conn = _sqlite3.connect(str(AGENT_DB))
    conn.row_factory = _sqlite3.Row
    cur  = conn.cursor()

    existing_ids = {row[0] for row in cur.execute("SELECT patient_id FROM patients").fetchall()}

    skipped = []
    errors  = []
    new_patients = []
    new_events   = []

    # ── Parse patients CSV ────────────────────────────────────
    try:
        raw = await patients_csv.read()
        reader = _csv.DictReader(_io.StringIO(raw.decode("utf-8-sig")))
        required = {"patient_id", "age", "gender", "trial_id", "state"}
        for i, row in enumerate(reader, start=2):
            missing = required - set(row.keys())
            if missing:
                errors.append(f"patients.csv row {i}: missing columns {missing}")
                continue
            pid = row["patient_id"].strip().upper()
            if pid in existing_ids:
                skipped.append(pid)
                continue
            try:
                age = int(row["age"])
            except ValueError:
                errors.append(f"patients.csv row {i}: age '{row['age']}' is not an integer")
                continue
            new_patients.append((
                pid,
                age,
                row["gender"].strip().capitalize(),
                row["trial_id"].strip().upper(),
                row["state"].strip().upper(),
            ))
            existing_ids.add(pid)
    except Exception as e:
        conn.close()
        return JSONResponse(status_code=400, content={"error": f"Failed to parse patients.csv: {e}"})

    # ── Parse events CSV (optional) ───────────────────────────
    if events_csv:
        try:
            raw = await events_csv.read()
            reader = _csv.DictReader(_io.StringIO(raw.decode("utf-8-sig")))
            required_ev = {"patient_id", "event_type", "event_name", "days_ago"}
            for i, row in enumerate(reader, start=2):
                missing = required_ev - set(row.keys())
                if missing:
                    errors.append(f"events.csv row {i}: missing columns {missing}")
                    continue
                pid = row["patient_id"].strip().upper()
                if pid not in existing_ids:
                    errors.append(f"events.csv row {i}: patient_id '{pid}' not in DB — import patient first")
                    continue
                try:
                    days_ago = int(row["days_ago"])
                except ValueError:
                    errors.append(f"events.csv row {i}: days_ago '{row['days_ago']}' is not an integer")
                    continue
                new_events.append((
                    pid,
                    row["event_type"].strip().lower(),
                    row["event_name"].strip(),
                    days_ago,
                ))
        except Exception as e:
            conn.close()
            return JSONResponse(status_code=400, content={"error": f"Failed to parse events.csv: {e}"})

    # ── Write to DB ───────────────────────────────────────────
    if new_patients:
        cur.executemany("INSERT INTO patients VALUES (?,?,?,?,?)", new_patients)
    if new_events:
        cur.executemany(
            "INSERT INTO patient_history (patient_id, event_type, event_name, days_ago) VALUES (?,?,?,?)",
            new_events,
        )
    conn.commit()
    conn.close()

    return JSONResponse(content={
        "patients_added": len(new_patients),
        "events_added":   len(new_events),
        "skipped":        skipped,
        "errors":         errors,
    })


@app.get("/api/import/template")
def download_csv_template():
    """Return CSV template strings for patients and events."""
    patients_template = (
        "patient_id,age,gender,trial_id,state\n"
        "PT-051,40,Female,NBM-BMX,TX\n"
        "PT-052,55,Male,GBM-RT,CA\n"
    )
    events_template = (
        "patient_id,event_type,event_name,days_ago\n"
        "PT-051,diagnosis,Glioblastoma,300\n"
        "PT-051,procedure,Brain Resection Surgery,295\n"
        "PT-051,lab,Normal Complete Labs,30\n"
        "PT-052,diagnosis,Glioblastoma,200\n"
        "PT-052,medication,Temozolomide,60\n"
    )
    return JSONResponse(content={
        "patients_csv": patients_template,
        "events_csv":   events_template,
        "instructions": (
            "POST both files to /api/import/patients. "
            "patients_csv is required; events_csv is optional. "
            "Existing patient_ids are skipped."
        ),
    })


# ── Phase 2 — Lab Threshold Screening (SSE streaming) ────────

# Thresholds for NBM-BMX Phase 2 eligibility
_LAB_THRESHOLDS = {
    "Platelets":  { "min": 75.0,  "max": None, "unit": "k/µL",   "label": "Platelets ≥ 75 k/µL"    },
    "Hgb":        { "min": 8.0,   "max": None, "unit": "g/dL",   "label": "Hgb ≥ 8.0 g/dL"         },
    "ANC":        { "min": 1.5,   "max": None, "unit": "×10⁹/L", "label": "ANC ≥ 1.5 ×10⁹/L"       },
    "Creatinine": { "min": None,  "max": 1.5,  "unit": "×ULN",   "label": "Creatinine ≤ 1.5 ×ULN"  },
    "AST":        { "min": None,  "max": 2.5,  "unit": "×ULN",   "label": "AST ≤ 2.5 ×ULN"         },
}
_REQUIRED_LABS = list(_LAB_THRESHOLDS.keys())


def _fetch_lab_checks(cur, patient_id: str) -> dict:
    """
    For each required lab, find the most recent numeric row in patient_history.
    Returns dict: lab_name → { value, days_ago, threshold, unit, pass } or None if missing.
    """
    checks = {}
    for lab in _REQUIRED_LABS:
        row = cur.execute(
            "SELECT lab_value, days_ago FROM patient_history "
            "WHERE patient_id=? AND event_type='lab' AND event_name=? "
            "AND lab_value IS NOT NULL ORDER BY days_ago ASC LIMIT 1",
            (patient_id, lab),
        ).fetchone()

        if row:
            val    = round(float(row["lab_value"]), 1)
            thresh = _LAB_THRESHOLDS[lab]
            passed = True
            if thresh["min"] is not None and val < thresh["min"]:
                passed = False
            if thresh["max"] is not None and val > thresh["max"]:
                passed = False
            checks[lab] = {
                "value":     val,
                "days_ago":  row["days_ago"],
                "threshold": f"≥{thresh['min']}" if thresh["min"] else f"≤{thresh['max']}",
                "unit":      thresh["unit"],
                "label":     thresh["label"],
                "pass":      passed,
            }
        else:
            checks[lab] = None   # missing — not on record

    return checks


def _compute_confidence(lab_checks: dict) -> int:
    """
    Score 0-100 based on lab presence and how far values are from thresholds.
    Missing labs penalise heavily; borderline values penalise lightly.
    """
    base = 100
    for lab, result in lab_checks.items():
        if result is None:
            base -= 18          # hard penalty for missing lab
        elif not result["pass"]:
            base -= 22          # failing a threshold
        else:
            # Soft penalty for being within 20% of the threshold
            thresh = _LAB_THRESHOLDS[lab]
            val    = result["value"]
            if thresh["min"] and val < thresh["min"] * 1.2:
                base -= 5       # borderline — passed but close
            if thresh["max"] and val > thresh["max"] * 0.85:
                base -= 5
    return max(0, min(100, base))


def _phase2_status(lab_checks: dict) -> str:
    missing = [k for k, v in lab_checks.items() if v is None]
    failing = [k for k, v in lab_checks.items() if v is not None and not v["pass"]]

    if len(missing) >= 3:
        return "INSUFFICIENT_DATA"
    if failing:
        return "DISQUALIFIED"        # failed a hard threshold
    if missing:
        return "QUALIFIED_MEDIUM"    # passes all present, but some missing
    return "QUALIFIED_HIGH"


@app.get("/api/screening/phase2/stream")
async def phase2_stream(ids: str):
    """
    SSE endpoint. Streams Phase 2 lab-check results one patient at a time.
    Query param:  ids=PT-006,PT-009,PT-015,...
    Each event:   data: { patient_id, phase2_status, confidence_score, lab_checks, ... }
    Final event:  data: { done: true, summary: {...} }
    """
    patient_ids = [p.strip() for p in ids.split(",") if p.strip()]

    async def generate():
        if not AGENT_DB.exists():
            yield f"data: {_json.dumps({'error': 'patients.db not found'})}\n\n"
            return

        conn = _sqlite3.connect(str(AGENT_DB))
        conn.row_factory = _sqlite3.Row
        cur  = conn.cursor()

        summary = { "total": len(patient_ids), "high": 0, "medium": 0, "insufficient": 0, "disqualified": 0 }

        for pid in patient_ids:
            await _asyncio.sleep(0.9)     # visible streaming delay per patient

            p = cur.execute("SELECT * FROM patients WHERE patient_id=?", (pid,)).fetchone()
            if not p:
                yield f"data: {_json.dumps({'patient_id': pid, 'error': 'not found'})}\n\n"
                continue

            lab_checks  = _fetch_lab_checks(cur, pid)
            status      = _phase2_status(lab_checks)
            confidence  = _compute_confidence(lab_checks)
            missing     = [k for k, v in lab_checks.items() if v is None]
            failing     = [k for k, v in lab_checks.items() if v is not None and not v["pass"]]

            # ── Phase 1 rule checks (reuse same logic as /api/screening) ──
            excluded_rules: list = []
            passed_rules:   list = []

            if p["age"] < 18 or p["age"] > 75:
                excluded_rules.append({"rule_id": "EX-05", "description": "Age outside 18–75 years",  "evidence": f"Age {p['age']}"})
            else:
                passed_rules.append(  {"rule_id": "EX-05", "description": "Age within 18–75 years",   "evidence": f"Age {p['age']}"})

            for rule in _RULES:
                hit = _check_rule(cur, pid, rule)
                if hit:
                    excluded_rules.append({"rule_id": rule["id"], "description": rule["desc"], "evidence": f"{hit['event_name']} ({hit['days_ago']} days ago)"})
                else:
                    passed_rules.append(  {"rule_id": rule["id"], "description": rule["desc"], "evidence": "No violation found"})

            # ── Event timeline ─────────────────────────────────────────────
            event_rows = cur.execute(
                "SELECT event_type, event_name, days_ago FROM patient_history "
                "WHERE patient_id=? AND lab_value IS NULL ORDER BY days_ago ASC",
                (pid,),
            ).fetchall()
            events = [{"event_type": e["event_type"], "event_name": e["event_name"], "days_ago": e["days_ago"]} for e in event_rows]

            # update summary counts
            if status == "QUALIFIED_HIGH":       summary["high"]         += 1
            elif status == "QUALIFIED_MEDIUM":   summary["medium"]       += 1
            elif status == "INSUFFICIENT_DATA":  summary["insufficient"] += 1
            elif status == "DISQUALIFIED":       summary["disqualified"] += 1

            result = {
                "patient_id":       pid,
                "age":              p["age"],
                "gender":           p["gender"],
                "trial_id":         p["trial_id"],
                "state":            p["state"],
                "phase2_status":    status,
                "confidence_score": confidence,
                "lab_checks":       lab_checks,
                "missing_labs":     missing,
                "failing_labs":     failing,
                "excluded_rules":   excluded_rules,
                "passed_rules":     passed_rules,
                "events":           events,
            }
            yield f"data: {_json.dumps(result)}\n\n"

        conn.close()
        yield f"data: {_json.dumps({'done': True, 'summary': summary})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":      "keep-alive",
        },
    )


# ── Commercial signals streaming chat endpoint ────────────────

_ROLE_INSTRUCTIONS = {
    "Researcher": (
        "You are a pharmaceutical research analyst providing a deep, data-driven analysis. "
        "Include statistical insights, geographic patterns, clinical evidence references, and areas needing further investigation. "
        "Be thorough and analytical — 5 to 8 sentences."
    ),
    "Brand Team": (
        "You are a pharmaceutical brand strategy analyst. "
        "Focus on market positioning, competitive threats, brand messaging opportunities, and sentiment trends that affect brand perception. "
        "Suggest actionable brand strategies. Be strategic and marketing-focused — 4 to 6 sentences."
    ),
    "Field Team": (
        "You are a pharmaceutical field force coach. "
        "Provide actionable HCP talking points, key objection-handling guidance, and territory-specific insights field reps can use in prescriber conversations. "
        "Format as concise bullet points — 4 to 6 points."
    ),
    "Medical Affairs": (
        "You are a pharmaceutical medical affairs expert. "
        "Focus on KOL themes, medical education opportunities, clinical evidence gaps, and scientific exchange topics for medical discussions. "
        "Identify key opinion leader perspectives and evidence-based messaging. Be scientifically rigorous — 5 to 7 sentences."
    ),
}


@app.get("/commercial/chat/stream")
async def commercial_chat_stream(
    question: str,
    state: str = "",
    city: str = "",
    role: str = "Researcher",
):
    """
    SSE endpoint. Streams a Gemini response token-by-token for commercial intelligence.
    Query params: question, state (abbr), city, role (Researcher|Brand Team|Field Team|Medical Affairs)
    Events: { token: "..." }  then final { done: true, sources: [...] }
    """
    async def generate():
        try:
            emb_result = gemini_client.models.embed_content(
                model="gemini-embedding-2",
                contents=question,
                config=types.EmbedContentConfig(output_dimensionality=768),
            )
            query_vector = emb_result.embeddings[0].values
        except Exception as e:
            yield f"data: {_json.dumps({'error': f'Embedding failed: {e}'})}\n\n"
            return

        knn_clause = {
            "field": "embedding",
            "query_vector": query_vector,
            "k": 8,
            "num_candidates": 25,
        }
        if state:
            knn_clause["filter"] = {"term": {"state": state.upper()}}

        try:
            es_response = es.search(index="commercial_signals", body={"knn": knn_clause})
        except Exception as e:
            yield f"data: {_json.dumps({'error': f'Search failed: {e}'})}\n\n"
            return

        sources = []
        context_parts = []
        for hit in es_response["hits"]["hits"]:
            src = hit["_source"]
            sources.append({
                "signal_id":   src.get("signal_id"),
                "title":       src.get("title"),
                "author":      src.get("author"),
                "url":         src.get("url"),
                "source_type": src.get("source_type"),
                "sentiment":   src.get("sentiment"),
                "topic":       src.get("topic"),
                "state":       src.get("state"),
                "date":        src.get("date"),
            })
            context_parts.append(
                f"[{src.get('source_type','')} | {src.get('sentiment','')} | {src.get('state','')} | {src.get('date','')}]\n"
                f"Author: {src.get('author','')}\n"
                f"Topic: {src.get('topic','')}\n"
                f"Content: {src.get('transcript','')[:600]}"
            )

        instruction = _ROLE_INSTRUCTIONS.get(role, _ROLE_INSTRUCTIONS["Researcher"])
        geo_ctx = ""
        if state:
            geo_ctx += f" Focus the analysis on the {state} market."
        if city:
            geo_ctx += f" Pay particular attention to {city}."

        context = "\n\n---\n\n".join(context_parts)
        prompt = (
            f"{instruction}{geo_ctx}\n\n"
            "Answer the question using only the signal data provided below. "
            "Be specific about regions, sentiments, and competitor mentions.\n\n"
            f"Question: {question}\n\n"
            f"Signal Data:\n{context}"
        )

        try:
            for chunk in gemini_client.models.generate_content_stream(
                model="gemini-2.0-flash",
                contents=prompt,
            ):
                if chunk.text:
                    yield f"data: {_json.dumps({'token': chunk.text})}\n\n"
                    await _asyncio.sleep(0)
        except Exception as e:
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
            return

        yield f"data: {_json.dumps({'done': True, 'sources': sources})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


# ── Multi-Agent Commercial Intelligence Stream ────────────────
#
#  Agent pipeline:
#    Orchestrator  →  Internal Agent (Elasticsearch)
#                 →  Web Scout (Tavily live search)
#                 →  Synthesizer (Gemini streaming, role-aware)
#
#  pip install tavily-python   ← required once

from tavily import TavilyClient as _TavilyClient

_tavily = _TavilyClient(api_key=os.getenv("TAVILY_API_KEY", ""))

# ── Role-specific synthesis prompts ──────────────────────────────
_INTEL_ROLE_PROMPTS = {
    "Researcher": (
        "You are a pharmaceutical Medical Affairs scientist. "
        "Structure your response using EXACTLY this format:\n\n"
        "## [Clinical Theme 1]\n"
        "Evidence summary: [2-3 sentences citing specific trials or data]\n\n"
        "**📰 Publications & Data:**\n"
        "- [specific trial name, data point, or publication]\n\n"
        "**🔬 Evidence Gaps:**\n"
        "- [what is still unknown or needs investigation]\n\n"
        "## [Next Clinical Theme]\n"
        "(repeat structure)\n\n"
        "## Scientific Assessment\n"
        "[3-4 sentence summary of the evidence landscape and key gaps]\n\n"
        "Be scientifically rigorous. Cite specific trial names and data points by name where relevant."
    ),
    "Brand Team": (
        "You are a senior pharmaceutical commercial analyst briefing a Brand Manager. "
        "Structure your response using EXACTLY this format:\n\n"
        "## [Key Commercial Finding 1]\n"
        "What's being said: [2-3 sentences describing the trend or message]\n\n"
        "**📰 News & Publications:**\n"
        "- [specific article or finding]\n\n"
        "**💬 Market Signal:**\n"
        "- [specific market or prescriber signal]\n\n"
        "## [Next Finding]\n"
        "(repeat structure)\n\n"
        "## Overall Assessment\n"
        "[3-4 sentence strategic recommendation with specific actions]\n\n"
        "Focus on: competitor threats, market share shifts, prescriber adoption barriers, territory performance."
    ),
    "Field Team": (
        "You are a pharmaceutical field force coach briefing sales representatives. "
        "Respond using EXACTLY this format:\n\n"
        "## Territory Intelligence\n"
        "[2-3 sentences on what is happening in the market right now]\n\n"
        "## Key HCP Talking Points\n"
        "- [specific, ready-to-use talking point 1]\n"
        "- [specific, ready-to-use talking point 2]\n"
        "- [specific, ready-to-use talking point 3]\n\n"
        "## Objection Handling\n"
        "- **Objection:** [common pushback] → **Response:** [specific rebuttal]\n\n"
        "## Action Items\n"
        "- [specific next step for the rep]\n\n"
        "Be direct, practical, and territory-specific. Field reps need to act on this immediately."
    ),
    "Medical Affairs": (
        "You are a pharmaceutical Medical Affairs expert. "
        "Structure your response using EXACTLY this format:\n\n"
        "## [KOL Theme 1]\n"
        "Scientific context: [2-3 sentences on the medical/scientific landscape]\n\n"
        "**📰 Evidence Base:**\n"
        "- [specific publication, trial, or guideline]\n\n"
        "**🔬 Evidence Gaps & Opportunities:**\n"
        "- [gap that Medical Affairs can address]\n\n"
        "## [Next KOL Theme]\n"
        "(repeat structure)\n\n"
        "## Medical Affairs Recommendation\n"
        "[3-4 sentence summary of scientific exchange priorities and MSL focus areas]\n\n"
        "Focus on KOL perspectives, evidence gaps, medical education opportunities, and scientific exchange topics."
    ),
}

# ── Pharma domains for Tavily web search ─────────────────────────
_PHARMA_DOMAINS = [
    "fda.gov", "nature.com", "cancerletter.com",
    "fiercepharma.com", "medpagetoday.com", "asco.org", "nejm.org",
    "cancernetwork.com", "onclive.com", "healio.com", "pharmatimes.com",
    "biopharmadive.com", "clinicaltrials.gov", "pubmed.ncbi.nlm.nih.gov",
]


@app.get("/commercial/intelligence/stream")
async def commercial_intelligence_stream(
    question: str,
    role: str = "Marketing",
    state: str = "",
):
    """
    SSE multi-agent commercial intelligence stream.
    Emits structured events per agent step, then streams the Gemini synthesis.

    Event shapes:
      { agent, status, message }              — step update
      { agent, status, message, sources, count } — step done with results
      { agent, token }                        — synthesizer streaming token
      { done, youtube_kols }                  — final event
    """
    async def generate():
      try:

        # ── ORCHESTRATOR ──────────────────────────────────────
        yield f"data: {_json.dumps({'agent': 'orchestrator', 'status': 'start', 'message': f'Routing to agents — {role} perspective'})}\n\n"
        await _asyncio.sleep(0.35)

        # ── INTERNAL AGENT (Elasticsearch kNN) ───────────────
        yield f"data: {_json.dumps({'agent': 'internal', 'status': 'searching', 'message': 'Searching internal commercial signals & patient data...'})}\n\n"

        internal_sources = []
        internal_context_parts = []
        try:
            emb = gemini_client.models.embed_content(
                model="gemini-embedding-2",
                contents=question,
                config=types.EmbedContentConfig(output_dimensionality=768),
            )
            knn_q = {
                "field": "embedding",
                "query_vector": emb.embeddings[0].values,
                "k": 4,
                "num_candidates": 15,
            }
            if state:
                knn_q["filter"] = {"term": {"state": state.upper()}}

            es_resp = es.search(index="commercial_signals", body={"knn": knn_q})
            for hit in es_resp["hits"]["hits"]:
                src = hit["_source"]
                internal_sources.append({
                    "title":       src.get("title", src.get("signal_id", "")),
                    "author":      src.get("author", ""),
                    "url":         src.get("url", ""),
                    "source_type": src.get("source_type", ""),
                    "sentiment":   src.get("sentiment", ""),
                    "topic":       src.get("topic", ""),
                    "state":       src.get("state", ""),
                    "date":        src.get("date", ""),
                    "snippet":     src.get("transcript", "")[:220],
                })
                internal_context_parts.append(
                    f"[Internal | {src.get('source_type','')} | {src.get('sentiment','')} | {src.get('state','')} | {src.get('date','')}]\n"
                    f"Title: {src.get('title','')}\n"
                    f"Content: {src.get('transcript','')[:400]}"
                )
        except Exception as _ie:
            print(f"[internal-agent error] {_ie}")

        yield f"data: {_json.dumps({'agent': 'internal', 'status': 'done', 'sources': internal_sources, 'count': len(internal_sources), 'message': f'Found {len(internal_sources)} internal signals'})}\n\n"
        await _asyncio.sleep(0.25)

        # ── WEB SCOUT AGENT (Tavily) ──────────────────────────
        yield f"data: {_json.dumps({'agent': 'web_scout', 'status': 'searching', 'message': 'Scanning pharma news, journals & publications live...'})}\n\n"

        web_sources = []
        web_context_parts = []
        try:
            tavily_query = question
            if state:
                tavily_query += f" {state}"

            tv_resp = _tavily.search(
                query=tavily_query,
                search_depth="advanced",
                max_results=8,
                include_domains=_PHARMA_DOMAINS,
            )
            for r in tv_resp.get("results", []):
                domain = r.get("url", "").split("/")[2] if r.get("url") else ""
                web_sources.append({
                    "title":   r.get("title", ""),
                    "url":     r.get("url", ""),
                    "source":  domain,
                    "snippet": r.get("content", "")[:220],
                    "score":   round(r.get("score", 0), 3),
                })
                web_context_parts.append(
                    f"[Web | {domain}]\n"
                    f"Title: {r.get('title','')}\n"
                    f"Content: {r.get('content','')[:400]}"
                )
        except Exception as _we:
            print(f"[web-scout] Tavily unavailable ({type(_we).__name__}) — continuing without web sources")
            web_sources = []

        yield f"data: {_json.dumps({'agent': 'web_scout', 'status': 'done', 'sources': web_sources, 'count': len(web_sources), 'message': f'Found {len(web_sources)} live web sources' if web_sources else 'Web search unavailable — using internal data only'})}\n\n"
        await _asyncio.sleep(0.25)

        # ── SYNTHESIZER AGENT (Gemini streaming) ─────────────
        yield f"data: {_json.dumps({'agent': 'synthesizer', 'status': 'thinking', 'message': f'Synthesizing all intelligence for {role} perspective...'})}\n\n"

        role_prompt   = _INTEL_ROLE_PROMPTS.get(role, _INTEL_ROLE_PROMPTS["Researcher"])
        int_context   = "\n\n---\n\n".join(internal_context_parts) or "(no internal signals found)"
        web_context   = "\n\n---\n\n".join(web_context_parts)      or "(no web sources found)"

        final_prompt = (
            f"{role_prompt}\n\n"
            f"Question: {question}\n\n"
            f"=== INTERNAL COMMERCIAL SIGNALS ===\n{int_context}\n\n"
            f"=== LIVE WEB INTELLIGENCE ===\n{web_context}\n\n"
            "Answer using the data above. Be specific about regions, drug names, and sources."
        )

        try:
            async for text in _fl_stream([{"role": "user", "content": final_prompt}], 1024):
                yield f"data: {_json.dumps({'agent': 'synthesizer', 'token': text})}\n\n"
        except Exception as _se:
            yield f"data: {_json.dumps({'agent': 'synthesizer', 'token': f'[Synthesis error: {_se}]'})}\n\n"

        yield f"data: {_json.dumps({'done': True})}\n\n"

      except Exception as _fatal:
        print(f"[intelligence-stream fatal] {_fatal}")
        yield f"data: {_json.dumps({'error': str(_fatal)})}\n\n"
        yield f"data: {_json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


class ReportRequest(BaseModel):
    question:         str
    state:            str  = ""
    role:             str  = "Researcher"
    internal_sources: list = []
    web_sources:      list = []

@app.post("/commercial/report")
async def generate_report(req: ReportRequest):
    """Streams a full structured commercial intelligence report from all gathered data."""
    import asyncio as _ra

    def _src_text(sources, label):
        if not sources:
            return f"(no {label} available)"
        lines = []
        for s in sources:
            meta = " | ".join(filter(None, [s.get("source_type", s.get("source","")), s.get("state",""), s.get("sentiment","")]))
            lines.append(f"• [{meta}] {s.get('title','')}\n  {s.get('snippet', s.get('transcript',''))[:300]}")
        return "\n\n".join(lines)

    prompt = f"""You are a senior pharmaceutical commercial intelligence analyst.
Generate a comprehensive, professional commercial intelligence report based on ALL data provided.

CONTEXT
Drug: Dordaviprone (Modeyso) — diffuse midline glioma treatment
Question: {req.question}
Region: {req.state or 'National (USA)'}
Team Role: {req.role}
Date: {__import__('datetime').date.today().strftime('%B %d, %Y')}

INTERNAL COMMERCIAL SIGNALS (CRM & field data)
{_src_text(req.internal_sources, 'internal signals')}

LIVE WEB INTELLIGENCE (pharma news & publications)
{_src_text(req.web_sources, 'web sources')}

Write the full report with these exact sections. Be specific — cite actual data points, drug names, states and sources found above. No generic filler.

# Commercial Intelligence Report — Dordaviprone (Modeyso)

## 1. Executive Summary
3-4 sentences: key takeaway, current commercial position, urgent signals.

## 2. Market Signal Analysis
What the internal CRM and field data reveals — sentiment, volume, regional patterns.

## 3. Live Web Intelligence
What the latest pharma news and publications say — approvals, competitor moves, trials.

## 4. Regional Insights
State/regional breakdown — where performance is strong, where needs attention.

## 5. Competitive Landscape
How competitors compare based on signals found (ribociclib, palbociclib, etc.).

## 6. Team Recommendations — {req.role} Perspective
3-5 specific, actionable recommendations based on ALL data above.

## 7. Key Risk Flags
Negative signals, gaps, or concerns the team must watch."""

    async def stream_report():
        try:
            async for text in _fl_stream([{"role": "user", "content": prompt}], 3000):
                yield f"data: {_json.dumps({'token': text})}\n\n"
            yield f"data: {_json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
            yield f"data: {_json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        stream_report(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/screening/agent/stream")
async def agent_screening_stream(ids: str):
    """
    Streams the full dual-agent SQL pipeline for selected patient IDs only.
    Events:
      { step: 'agent1', status: 'start' }
      { step: 'agent1', status: 'done', draft_sql: '...' }
      { step: 'agent2', status: 'start' }
      { step: 'agent2', status: 'done', audit_status: '...', reasoning: '...', safe_sql: '...' }
      { step: 'executor', status: 'start' }
      { step: 'executor', status: 'done', excluded: [...], pre_qualified: [...] }
      { step: 'phase2', patient_id: '...', ...phase2_result }
      { done: true }
    """
    global _SQL_CACHE
    selected_ids = [p.strip() for p in ids.split(",") if p.strip()]

    async def generate():
        global _SQL_CACHE
        try:
            if _SQL_CACHE:
                # ── CACHED: agents already ran — replay instantly ──
                yield f"data: {_json.dumps({'step': 'agent1', 'status': 'start'})}\n\n"
                await _asyncio.sleep(0.4)
                yield f"data: {_json.dumps({'step': 'agent1', 'status': 'done', 'sql': _SQL_CACHE['draft_sql'], 'rules_applied': _SQL_CACHE['a1_rules'], 'cached': True})}\n\n"
                await _asyncio.sleep(0.4)
                yield f"data: {_json.dumps({'step': 'agent2', 'status': 'start'})}\n\n"
                await _asyncio.sleep(0.4)
                yield f"data: {_json.dumps({'step': 'agent2', 'status': 'done', 'result': _SQL_CACHE['audit_status'], 'reasoning': _SQL_CACHE['reasoning'], 'safe_sql': _SQL_CACHE['safe_sql'], 'cached': True})}\n\n"
                await _asyncio.sleep(0.4)
                safe_sql = _SQL_CACHE['safe_sql']
            else:
                # ── FIRST RUN: call both agents, then cache ────────
                protocol = _json.loads((AGENT_DIR / "protocol_NBM_BMX.json").read_text())

                yield f"data: {_json.dumps({'step': 'agent1', 'status': 'start'})}\n\n"
                a1        = await _asyncio.to_thread(_agent_mod.call_agent1, protocol, "gemini-2.5-flash")
                draft_sql = a1["draft_sql"]
                yield f"data: {_json.dumps({'step': 'agent1', 'status': 'done', 'sql': draft_sql, 'rules_applied': a1.get('rules_applied', [])})}\n\n"

                yield f"data: {_json.dumps({'step': 'agent2', 'status': 'start'})}\n\n"
                a2           = await _asyncio.to_thread(_agent_mod.call_agent2, protocol, draft_sql, "gemini-2.5-flash")
                safe_sql     = a2["safe_sql"]
                audit_status = a2["status"].lower().replace('_and_', ' & ')
                reasoning    = a2["reasoning"]
                yield f"data: {_json.dumps({'step': 'agent2', 'status': 'done', 'result': audit_status, 'reasoning': reasoning, 'safe_sql': safe_sql})}\n\n"

                _SQL_CACHE = {
                    'draft_sql':    draft_sql,
                    'a1_rules':     a1.get('rules_applied', []),
                    'safe_sql':     safe_sql,
                    'audit_status': audit_status,
                    'reasoning':    reasoning,
                }
                _SQL_CACHE_FILE.write_text(_json.dumps(_SQL_CACHE, indent=2))

            # ── EXECUTOR: pure Python, always runs fresh ───────────
            yield f"data: {_json.dumps({'step': 'executor', 'status': 'start'})}\n\n"
            excluded      = _agent_mod.execute_sql(safe_sql)
            pre_qualified = [pid for pid in selected_ids if pid not in excluded]
            also_excluded = [pid for pid in selected_ids if pid in excluded]

            yield f"data: {_json.dumps({'step': 'executor', 'status': 'done', 'excluded': also_excluded, 'pre_qualified': pre_qualified})}\n\n"
            await _asyncio.sleep(0.4)

            # ── PHASE 2: Lab checks for pre-qualified only ─────────
            if pre_qualified:
                conn = _sqlite3.connect(str(AGENT_DB))
                conn.row_factory = _sqlite3.Row
                cur  = conn.cursor()

                for pid in pre_qualified:
                    await _asyncio.sleep(0.8)
                    p = cur.execute("SELECT * FROM patients WHERE patient_id=?", (pid,)).fetchone()
                    if not p:
                        continue

                    lab_checks = _fetch_lab_checks(cur, pid)
                    status     = _phase2_status(lab_checks)
                    confidence = _compute_confidence(lab_checks)
                    missing    = [k for k, v in lab_checks.items() if v is None]
                    failing    = [k for k, v in lab_checks.items() if v is not None and not v["pass"]]

                    excluded_rules, passed_rules = [], []
                    if p["age"] < 18 or p["age"] > 75:
                        excluded_rules.append({"rule_id": "EX-05", "description": "Age outside 18–75 years", "evidence": f"Age {p['age']}"})
                    else:
                        passed_rules.append({"rule_id": "EX-05", "description": "Age within 18–75 years", "evidence": f"Age {p['age']}"})

                    for rule in _RULES:
                        hit = _check_rule(cur, pid, rule)
                        if hit:
                            excluded_rules.append({"rule_id": rule["id"], "description": rule["desc"], "evidence": f"{hit['event_name']} ({hit['days_ago']} days ago)"})
                        else:
                            passed_rules.append({"rule_id": rule["id"], "description": rule["desc"], "evidence": "No violation found"})

                    yield f"data: {_json.dumps({'step': 'phase2', 'patient_id': pid, 'age': p['age'], 'gender': p['gender'], 'state': p['state'], 'trial_id': p['trial_id'], 'phase2_status': status, 'confidence_score': confidence, 'lab_checks': lab_checks, 'missing_labs': missing, 'failing_labs': failing, 'excluded_rules': excluded_rules, 'passed_rules': passed_rules})}\n\n"

                conn.close()

            yield f"data: {_json.dumps({'done': True})}\n\n"

        except Exception as _e:
            yield f"data: {_json.dumps({'error': str(_e)})}\n\n"
            yield f"data: {_json.dumps({'done': True})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.websocket("/ws/commercial")
async def ws_commercial(websocket: WebSocket):
    """
    WebSocket endpoint for real-time commercial intelligence chat.
    Client sends: { "question": "...", "state": "TX", "role": "Researcher", "city": "" }
    Server streams: { "type": "token", "text": "..." }  then  { "type": "done" }
    """
    await websocket.accept()
    import json as _wsjson
    try:
        while True:
            raw  = await websocket.receive_text()
            data = _wsjson.loads(raw)
            question = data.get("question", "")
            state    = data.get("state", "")
            role     = data.get("role", "Researcher")

            if not question:
                await websocket.send_text(_wsjson.dumps({"type": "error", "text": "Empty question"}))
                continue

            await websocket.send_text(_wsjson.dumps({"type": "status", "text": "Searching commercial signals…"}))

            # ── Elasticsearch kNN ────────────────────────────────
            internal_context = ""
            try:
                emb = gemini_client.models.embed_content(
                    model="gemini-embedding-2",
                    contents=question,
                    config=types.EmbedContentConfig(output_dimensionality=768),
                )
                knn_q = {"field": "embedding", "query_vector": emb.embeddings[0].values, "k": 4, "num_candidates": 15}
                if state:
                    knn_q["filter"] = {"term": {"state": state.upper()}}
                hits = es.search(index="commercial_signals", body={"knn": knn_q})["hits"]["hits"]
                parts = []
                for h in hits:
                    s = h["_source"]
                    parts.append(f"[{s.get('source_type','')} | {s.get('sentiment','')} | {s.get('state','')}] {s.get('title','')}: {s.get('transcript','')[:200]}")
                internal_context = "\n\n".join(parts)
            except Exception as _e:
                internal_context = f"(Elasticsearch unavailable: {_e})"

            # ── Tavily web search ────────────────────────────────
            await websocket.send_text(_wsjson.dumps({"type": "status", "text": "Searching live pharma sources…"}))
            web_context = ""
            try:
                if _tavily:
                    r = _tavily.search(
                        query=f"{question} dordaviprone {state or 'USA'} pharmaceutical",
                        max_results=3,
                        include_domains=_PHARMA_DOMAINS,
                    )
                    web_context = "\n\n".join([f"[Web] {x.get('title','')}: {x.get('content','')[:200]}" for x in r.get("results", [])])
            except Exception as _e:
                web_context = f"(Web search unavailable: {_e})"

            # ── Gemini synthesis ─────────────────────────────────
            await websocket.send_text(_wsjson.dumps({"type": "status", "text": "Generating answer…"}))
            prompt = (
                f"You are a pharmaceutical commercial intelligence analyst with a {role} perspective.\n"
                f"Question: {question}\n"
                f"{'State context: ' + state if state else ''}\n\n"
                f"INTERNAL DATA:\n{internal_context}\n\n"
                f"LIVE WEB DATA:\n{web_context}\n\n"
                f"Give a concise, data-driven answer in 3-4 sentences. Be specific about signals and trends."
            )
            full = ""
            try:
                for chunk in gemini_client.models.generate_content_stream(
                    model="gemini-2.0-flash",
                    contents=prompt,
                ):
                    if chunk.text:
                        full += chunk.text
                        await websocket.send_text(_wsjson.dumps({"type": "token", "text": chunk.text}))
            except Exception as _ge:
                await websocket.send_text(_wsjson.dumps({"type": "token", "text": f"[Error: {_ge}]"}))

            await websocket.send_text(_wsjson.dumps({"type": "done", "full": full}))

    except WebSocketDisconnect:
        pass
    except Exception as _fatal:
        try:
            await websocket.send_text(_wsjson.dumps({"type": "error", "text": str(_fatal)}))
        except Exception:
            pass


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
