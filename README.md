# assist

Multi-agent chat platform built on [Google ADK](https://github.com/google/adk-python). Define agents through a web UI, chat with them, and optionally let them render rich UI (charts, tables, forms) via [OpenUI](https://github.com/thesysdev/openui).

## Setup

```bash
# Python backend
uv sync

# Frontend
cd web && npm install

# Credentials
cp .env.example .env
# Edit .env with your GOOGLE_API_KEY or Vertex AI config
```

## Development

```bash
# In separate terminals:
make backend    # FastAPI on :8000
make frontend   # Vite on :5173
```

Open http://localhost:5173.

## Usage

1. **Create an agent** — give it a name, system prompt, and model. Check "Enable UI components" if you want it to render charts/tables/forms.
2. **Start a session** — click Chat on an agent card.
3. **Talk** — messages stream in real-time via SSE.

Sessions persist as JSONL files in `data/sessions/` and can be reopened.

## Static checks

```bash
make check    # lint + format + typecheck (Python & frontend)
make format   # auto-fix Python formatting
```

## Stack

- **Backend:** Python, FastAPI, Google ADK, uvicorn
- **Frontend:** React 19, TypeScript, Vite, OpenUI
- **Persistence:** JSON (agents) + JSONL (sessions) on disk
- **Package manager:** uv (Python), npm (frontend)
