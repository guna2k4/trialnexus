# TrialNexus — AI-Native Clinical Trial CRM

> Match · Screen · Launch

An AI-powered clinical trial patient matching platform that combines multimodal vector search with a structured SQL eligibility gate to find and verify eligible patients for clinical trials.

## Live Demo

**Frontend:** http://utsvkrdiogsdq2md63dn1dy.144.202.52.13.sslip.io


---

## What It Does

### Phase 1 — Multimodal Patient Search
- Upload MRI brain scans + clinical notes + lab results
- Google Gemini multimodal embeddings (image + text → 768-dim vector)
- Elasticsearch KNN semantic search returns ranked patient matches

### Phase 2 — SQL Eligibility Gate
- Google Gemini transforms natural language criteria into precise SQL queries
- SQLite patients.db executes deterministic trial protocol rules
- Every patient marked Eligible ✓ or Excluded ✗ with full reasoning shown

### Commercial Intelligence
- External agent pulls live market signals via Tavily AI
- Internal agent pulls trial data from Elasticsearch vector DB
- Featherless.ai (Qwen 2.5-72B) synthesizes a full executive report in real time

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Vector DB | Elasticsearch 8 (Elastic Cloud) |
| Embeddings | Google Gemini multimodal embedding |
| SQL Agent | Google Gemini + SQLite |
| Commercial LLM | Featherless.ai — Qwen 2.5-72B Instruct |
| Web Intelligence | Tavily AI |
| Deployment | Vultr VM · Docker Compose · Coolify |

---

## Deployment

Fully deployed on **Vultr** — backend, frontend, and vector database all running via Docker Compose managed by Coolify.

---

## Research Backing

- **FHIR-AgentBench** (MIT + Verily, 2025) — proves pure LLM on clinical data = 50% accuracy
- **Nature Communications Medicine** (Nov 2025) — multimodal AI achieves 87% real-world accuracy
- TrialNexus combines both approaches to close the gap

---

Built for the Vultr Hackathon 2026
