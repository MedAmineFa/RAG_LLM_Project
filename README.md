# 🤖 RAG & LLM Project: Smart Assistant and Financial KPI Analysis

An AI solution for a financial web application, made of two modules:

1. **A RAG chatbot** that answers questions from a reference document, understands the conversation, and can navigate the user to the right page of the application.
2. **An automated financial KPI analysis module** that generates structured analyses with an LLM, supports per-KPI drill-down and targeted edits, and exports to Word or PDF.

---

## 📑 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Option A — Docker](#option-a--docker-recommended)
  - [Option B — Manual setup](#option-b--manual-setup-without-docker)
- [API Reference](#-api-reference)
- [Customization](#-customization)
- [Author](#-author)

---

## ✨ Features

### 1. 💬 Smart Chatbot (RAG)

| Feature | Description |
|---|---|
| **Document-grounded answers** | Answers come only from the indexed PDF (RAG). The model is instructed never to use its own knowledge. |
| **No hallucination** | If the information is not in the document, the chatbot says so and suggests contacting support instead of inventing an answer. |
| **Multilingual** | Always replies in the language of the user. Navigation confirmations are available in French, English, Arabic, Spanish, German and Italian. |
| **Conversation memory** | The last 5 exchanges are passed to the agent, so follow-up and incomplete questions are understood in context. |
| **Smart navigation** | Requests like *"open the KPIs"* or *"emmène-moi vers les indicateurs"* are matched to application features (defined in JSON files) and the user is redirected to the right page. |
| **Role-based access** | Each feature declares which roles can access it; features the user is not allowed to see are never suggested. |
| **Tool-using agent** | A LangGraph ReAct agent chooses between a navigation tool and a document-search tool for each request. |
| **Input validation** | Empty questions and questions over 2,000 characters are rejected. |

### 2. 📊 Financial KPI Analysis

A consolidated dashboard shows **12 KPIs** with N / N-1 values and variations: revenue, export revenue, gross margin, EBITDA, net income, group equity, net debt, net financial debt, cash, investments (CAPEX), interest expenses, and headcount.

Each KPI is broken down into accounting detail lines with their **ANC/PCG code** and **IFRS/IAS reference**.

**Filters**

- 🗓️ Period: `Q1`, `Q2`, `Q3`, `Q4`
- 🏢 Scope: `Global`, `Region`, `Business Unit`, `Country`

**Two analysis modes (streamed in real time)**

| Mode | Generated sections |
|---|---|
| **Global analysis** | Executive summary, Operational performance, Profitability, Cash & liquidity, Financial structure, Points of attention, Strategic recommendations |
| **Single-KPI analysis (drill-down)** | Summary, Component analysis (growth drivers, identified brakes, neutral/stable items), Positive points, Warning signals, Perspective, Recommendations |

**Targeted edits ("Solution Wording")**

The user can ask for a focused change (e.g. *"detail the revenue"*, *"rewrite in English"*, *"make it more concise"*). Only the targeted KPI or section is modified; the rest of the analysis keeps the exact same structure. Predefined prompt templates are available for both global and KPI analyses.

**Smart safeguards**

Before any edit, the instruction is classified by the LLM and blocked if it is:

- **Off-topic** (greetings, jokes, weather, politics, sport, etc.)
- A **structure violation** (adding, removing, renaming, merging or reordering sections)
- **Too broad** (several unrelated changes in a single instruction)

Valid instructions are typed as `enrichment`, `wording`, or `correction`.

**Reliability and privacy**

- **Consistency checks:** the prompt runs mandatory coherence checks first and flags mathematical impossibilities (for example gross margin above revenue, or export revenue above total revenue) instead of interpreting them.
- **Value tokenization:** monetary amounts are replaced by opaque tokens (`TOK_0001`, ...) before being sent to the LLM, and are restored in the streamed response on the backend. Percentage variations and structural ratios (e.g. net debt / EBITDA) are computed locally.
- **Per-KPI thresholds** define what counts as a significant variation.
- **Retry with exponential backoff** on rate limits and temporary API errors (429, 5xx).

**Result management**

- 🔄 Re-run the analysis
- ✏️ Edit it in a rich-text editor (bold, italic, underline, lists, alignment, colors, highlight, undo/redo)
- 📄 Export to **Word (.docx)** or **PDF**

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────┐
│  React + Vite frontend (ia_assistant)      │
│  • Chat page            • KPI dashboard    │
│  • Rich-text editor     • Word / PDF export│
└──────────────────────┬─────────────────────┘
                       │ REST / SSE (port 8000)
┌──────────────────────▼─────────────────────┐
│  FastAPI backend (ia_backend)              │
├──────────────────────┬─────────────────────┤
│ POST /api/ai-assistant│ POST /api/analyze-kpis
│                      │                     │
│  LangGraph ReAct     │  Tokenize amounts   │
│  agent               │        ↓            │
│   ├─ navigate_tool   │  Classify request   │
│   └─ rag_tool        │        ↓            │
│                      │  Build prompt       │
│                      │        ↓            │
│                      │  Stream + de-tokenize
└───────┬──────────────┴──────────┬──────────┘
        │                         │
┌───────▼───────────┐     ┌───────▼───────┐
│ PostgreSQL        │     │   Groq API    │
│ + pgvector        │     │ gpt-oss-120b  │
│  • documents      │     └───────────────┘
│  • features       │
└───────▲───────────┘
        │ embeddings
┌───────┴───────────┐
│ Ollama            │
│ nomic-embed-text- │
│ v2-moe            │
└───────────────────┘
```

**Chatbot flow**

1. The agent receives the question and the last 5 exchanges.
2. For navigation intent, `navigate_tool` searches the features collection (cosine similarity, threshold `0.55`) and checks the user's roles.
3. Otherwise, `rag_tool` retrieves the 6 most similar chunks and the LLM answers using only that context.

**Indexing**

- The PDF is split into chunks of 800 characters with 150 overlap, embedded with `nomic-embed-text-v2-moe`, and stored in pgvector (`documents_collection`).
- Feature JSON files are embedded from their label, description, keywords and actions (`features_collection`).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, Uvicorn |
| LLM | `openai/gpt-oss-120b` via Groq API |
| RAG / agents | LangChain, LangGraph |
| Embeddings | Ollama (`nomic-embed-text-v2-moe`) |
| Vector store | PostgreSQL + pgvector (`langchain-postgres`) |
| PDF loading | PyPDF |
| Frontend | React 19, TypeScript, Vite, Chakra UI |
| Rich-text editor | TipTap |
| Markdown rendering | react-markdown, KaTeX |
| Export | `docx` (Word), `jsPDF` (PDF) |
| Containerization | Docker, Docker Compose (`pgvector/pgvector:pg16`, `ollama/ollama`) |

---

## 📁 Project Structure

```
.
├── docker-compose.yml                  # Full stack: postgres, ollama, backend, frontend
├── ia_backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.example                    # Copy to .env and set API_KEY
│   ├── app.py                          # FastAPI entry point (CORS, routers)
│   ├── requirements.txt
│   ├── finance.pdf                     # Sample reference document
│   ├── flask_documentation.pdf         # Sample reference document
│   ├── routers/
│   │   ├── chat.py                     # POST /api/ai-assistant
│   │   └── kpi.py                      # POST /api/analyze-kpis (SSE)
│   └── services/
│       ├── chatbot/
│       │   ├── agent.py                # LangGraph ReAct agent
│       │   ├── tools.py                # navigate_tool and rag_tool
│       │   ├── vectorstore.py          # pgvector + Ollama embeddings
│       │   ├── chat/
│       │   │   ├── Indexation_CHAT.py  # PDF indexing
│       │   │   ├── Retrieval_CHAT.py   # Similarity search
│       │   │   └── Generation_CHAT.py  # Answer generation (Groq)
│       │   └── feature_registry/
│       │       ├── features/           # Feature JSON files (assistant, kpis)
│       │       ├── features_indexer.py
│       │       └── features_vectorstore.py
│       └── kpis/
│           ├── Generation_KPIs.py      # Prompts, classification, streaming
│           ├── chiffrement.py          # Value tokenization
│           └── dechiffrement.py        # Streaming de-tokenization
└── ia_assistant/                       # React frontend
    ├── Dockerfile
    ├── .dockerignore
    └── src/
        ├── pages/assisant/             # Chat page
        ├── pages/kpis/KpisPage.tsx     # KPI dashboard, editor, export
        ├── services/IAserviceApi.ts    # API client
        └── router.tsx
```

---

## 🚀 Getting Started

### Option A — Docker (recommended)

Runs the whole stack (PostgreSQL + pgvector, Ollama, backend, frontend) with a few commands. No local Python, Node.js, PostgreSQL or Ollama installation is needed.

#### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2 (`docker compose`)
- A [Groq API key](https://console.groq.com/)
- About 2 GB of free disk space (images + embedding model)

#### 1. Clone and configure

```bash
git clone https://github.com/MedAmineFa/RAG_LLM_Project.git
cd RAG_LLM_Project

cp ia_backend/.env.example ia_backend/.env
# then edit ia_backend/.env and set API_KEY=your_groq_api_key
```

> In Docker, only `API_KEY` is required in `.env`. The database URL and the Ollama host are injected by `docker-compose.yml` and override any value in the file.

#### 2. Start the stack

```bash
docker compose up -d --build
```

#### 3. Download the embedding model (first run only)

The Ollama container starts empty, so the model must be pulled once. It is stored in the `ollama_data` volume and survives restarts.

```bash
docker compose exec ollama ollama pull nomic-embed-text-v2-moe
```

#### 4. Index the data (first run only)

The database also starts empty. Index the reference PDF and the application features:

```bash
# Reference PDF (finance.pdf by default)
docker compose exec backend python services/chatbot/chat/Indexation_CHAT.py

# Application features (JSON files)
docker compose exec backend python services/chatbot/feature_registry/features_indexer.py
```

The `pgvector` extension is created automatically, and the embeddings are stored in the `postgres_data` volume.

#### 5. Open the app

| Service | URL | Notes |
|---|---|---|
| Frontend | http://localhost:5173 | `/` chatbot, `/kpis` KPI dashboard |
| Backend API | http://localhost:8000/docs | Interactive Swagger docs |
| PostgreSQL | `127.0.0.1:5433` | user `postgres`, db `DOCUMENT` (development credentials, see `docker-compose.yml`) |
| Ollama | `127.0.0.1:11435` | Only exposed on the local machine |

#### Useful commands

```bash
docker compose ps                       # service status
docker compose logs -f backend          # follow backend logs
docker compose up -d --build backend    # rebuild after changing backend code or the PDF
docker compose down                     # stop (data is kept)
docker compose down -v                  # stop AND delete the database and the Ollama model
```

#### Troubleshooting

| Problem | Cause / fix |
|---|---|
| `env file ia_backend/.env not found` | Run `cp ia_backend/.env.example ia_backend/.env` and set `API_KEY`. |
| Chatbot returns an error / Ollama `model not found` (404) | The embedding model was not pulled. Run step 3. |
| The chatbot says it has no information | The data was not indexed, or the database volume was deleted. Run step 4. |
| Browser shows a CORS error | Open `http://localhost:5173`, not `http://127.0.0.1:5173`. |
| `port is already allocated` | Another service uses 5173, 8000, 5433 or 11435. Stop it, or change the left side of the port mapping in `docker-compose.yml`. |
| You changed `finance.pdf` or the code | Files are copied into the image at build time. Rebuild with `docker compose up -d --build backend`, then re-run the indexing. |

> ⚠️ **Development setup.** The frontend runs the Vite dev server, and the PostgreSQL password is a development value written in `docker-compose.yml`. Change it, and serve a static frontend build (e.g. with Nginx), before any production deployment.

---

### Option B — Manual setup (without Docker)

#### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension
- [Ollama](https://ollama.com/)
- A [Groq API key](https://console.groq.com/)

#### 1. Clone the repository

```bash
git clone https://github.com/MedAmineFa/RAG_LLM_Project.git
cd RAG_LLM_Project
```

#### 2. Prepare the database and embedding model

```sql
CREATE DATABASE "DOCUMENT";
-- then, connected to that database:
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
ollama pull nomic-embed-text-v2-moe
```

#### 3. Configure the backend

```bash
cd ia_backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `ia_backend/.env`:

```env
# Groq API key
API_KEY=your_groq_api_key

# PostgreSQL connection (same value for both variables)
CONNECTION=postgresql+psycopg2://postgres:password@localhost:5432/DOCUMENT
PGVECTOR_CONNECTION_STRING=postgresql+psycopg2://postgres:password@localhost:5432/DOCUMENT

# Optional (defaults shown)
EMBEDDING_MODEL=nomic-embed-text-v2-moe
DOCUMENTS_COLLECTION_NAME=documents_collection
FEATURES_COLLECTION_NAME=features_collection
SIMILARITY_THRESHOLD=0.55
```

> `CONNECTION` is used by the indexing scripts and `PGVECTOR_CONNECTION_STRING` by the running API.

#### 4. Index the data

From the root of the repository:

```bash
# Index the reference PDF (finance.pdf by default)
# ⚠️ The PDF path is set at the bottom of Indexation_CHAT.py ("/app/finance.pdf" for Docker).
# For a local run, change it to "ia_backend/finance.pdf".
python ia_backend/services/chatbot/chat/Indexation_CHAT.py

# Index the application features (JSON files)
python ia_backend/services/chatbot/feature_registry/features_indexer.py
```

#### 5. Run the backend

```bash
cd ia_backend
uvicorn app:app --reload --port 8000
```

The API runs on `http://127.0.0.1:8000`, with interactive docs at `/docs`.

#### 6. Run the frontend

```bash
cd ia_assistant
npm install
npm run dev
```

Open `http://localhost:5173`:

- `/` → AI assistant (chatbot)
- `/kpis` → KPI dashboard and analysis

> The backend CORS policy allows `http://localhost:5173`, and the frontend calls `http://127.0.0.1:8000`.
> Open the app with `localhost`, not `127.0.0.1`, otherwise the browser blocks the API calls (CORS).

---

## 📡 API Reference

### `POST /api/ai-assistant`

```json
// Request
{
  "question": "What is EBITDA?",
  "history": [{ "user": "Hello", "bot": "Hi! How can I help?" }]
}

// Response
{
  "answer": "…",
  "model_used": "openai/gpt-oss-120b",
  "navigation": null,
  "success": true
}
```

When the request is a navigation intent, `navigation` contains `featureId`, `route`, `label`, `actionId`, `actionLabel` and `score`, and `answer` is a short confirmation in the user's language.

### `POST /api/analyze-kpis`

Returns a **Server-Sent Events** stream (`text/event-stream`) ending with `[DONE]`.

```json
{
  "period": "Q2",
  "perimetre": "Global",
  "kpis": [
    { "name": "Chiffre d'Affaires", "unit": "K€", "currentAmount": 1000, "previousAmount": 900, "variation": 11.11 }
  ],
  "selectedKpi": null,
  "mentionedKpisDetails": null,
  "refinementPrompt": null,
  "previousAnalysis": null
}
```

- Set `selectedKpi` (with its `details`) for a single-KPI drill-down.
- Set `refinementPrompt` and `previousAnalysis` for a targeted edit.

---

## 🔧 Customization

### Add your own documents

1. Put your PDF in `ia_backend/`.
2. Update the PDF path at the bottom of `Indexation_CHAT.py`.
3. Re-run the indexing script (it replaces the previous collection).

> **With Docker:** the PDF is copied into the image at build time. Rebuild first with `docker compose up -d --build backend`, then run `docker compose exec backend python services/chatbot/chat/Indexation_CHAT.py`.

### Add a navigable feature

Create a JSON file in `ia_backend/services/chatbot/feature_registry/features/`, then re-run `features_indexer.py` (with Docker: rebuild the backend first, then run `docker compose exec backend python services/chatbot/feature_registry/features_indexer.py`):

```json
{
  "id": "kpis",
  "label": "KPI Consolidation",
  "route": "/kpis",
  "enabled": true,
  "roles": ["*"],
  "description": "Consolidated financial dashboard…",
  "keywords": ["kpi", "dashboard", "ebitda"],
  "actions": [
    { "id": "kpis.analyse-globale", "label": "Analyze with AI", "description": "Generates a full analysis" }
  ]
}
```

### Connect real financial data

The dashboard currently runs on built-in sample data (`FAKE_DATA` in `ia_assistant/src/pages/kpis/KpisPage.tsx`) that follows the same structure expected by `/api/analyze-kpis`. To use real data, replace it with a call to your own API returning the same fields (`name`, `unit`, `currentAmount`, `previousAmount`, `variation`, and `details` with `codeANC`, `codeIFRS`, `description`, `fluxN`, `fluxNMinus1`).

---

## 👤 Author

**Med Amine Fassatoui**
GitHub: [@MedAmineFa](https://github.com/MedAmineFa)
