# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

KEEP IT SIMPLE!

Security is a primary goal. Consider security implications (OWASP top 10, auth bypass, injection, data exposure, etc.) in every implementation.

## What is this

assist is a multi-agent chat platform built on Google ADK (Agent Development Kit). Users define agents through a web UI (name, system prompt, model, generation params), then open chat sessions with them. Agents can optionally render rich UI (charts, tables, forms) via OpenUI.

## Commands

```bash
make backend          # FastAPI on :8000 (auto-reload)
make frontend         # Vite on :5173 (proxies /api to :8000)
make check            # ALWAYS run after changes — lint + format + typecheck (Python & frontend)
make format           # auto-fix Python lint/format issues
```

Frontend deps: `cd web && npm install`. Python deps: `uv sync`.

## Architecture

**Backend** (`src/assist/`): FastAPI app with REST endpoints for CRUD on agents and sessions, plus an SSE streaming endpoint for chat.

- `app.py` — routes and FastAPI app. Chat endpoint streams via SSE.
- `runner.py` — creates an ADK `LlmAgent` from an `AgentDefinition`, replays conversation history into the session, runs one turn, yields text chunks. If `enable_ui` is on, the OpenUI system prompt is prepended to the agent instruction.
- `store.py` — file-based persistence. Agents in `data/agents.json` (single array). Sessions as `data/sessions/{id}.meta.json` + `{id}.jsonl` (append-only message log).
- `models.py` — Pydantic models: `AgentDefinition`, `AgentCreate`, `AgentUpdate`, `SessionMeta`, `SessionDetail`, `Message`.

**Frontend** (`web/src/`): Single-component React app.

- `App.tsx` — two views: agent list (create/delete agents, see recent sessions) and chat (sidebar with sessions, message area with streaming). When `enable_ui` is true for an agent, agent messages render through OpenUI's `<Renderer>` instead of plain text.
- `api.ts` — typed API client. `api.chat()` is an async generator that parses SSE events and yields text chunks.
- `index.css` — dark theme, CSS variables for all colors.

**Data flow for a chat turn:**
1. Frontend POSTs `{message, ui_prompt?}` to `/api/sessions/{id}/chat`
2. Backend appends user message to JSONL, loads history, calls `run_turn()`
3. `run_turn()` creates a throwaway ADK session, replays history as events, sends the new message through ADK's `Runner`
4. Text chunks stream back as SSE `data: {"chunk": "..."}` events
5. On completion, backend appends agent message to JSONL

## Key constraints

- ADK agent names must be valid Python identifiers — the runner prefixes IDs with `agent_`.
- Agent IDs are 12-char hex strings, auto-generated.
- The OpenUI system prompt (~20KB) is sent from the frontend per chat request, only when `enable_ui` is true.
- `verbatimModuleSyntax` is enabled in tsconfig — use `import type` for type-only imports.
- Vite proxies `/api` to the backend in dev; in production, FastAPI serves `web/dist/` as static files.

## Environment

Copy `.env.example` to `.env` at the project root. Needs `GOOGLE_API_KEY` or Vertex AI credentials.
