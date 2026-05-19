"""FastAPI application — REST API for agents/sessions + SSE chat."""

from __future__ import annotations

import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import StreamingResponse

from .auth import AuthMiddleware, router as auth_router
from .models import (
    AgentCreate,
    AgentDefinition,
    AgentUpdate,
    Message,
    Role,
    SessionDetail,
    SessionMeta,
)
from .runner import run_turn
from .store import Store

load_dotenv()

app = FastAPI(title="aissist")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    SessionMiddleware,
    secret_key=__import__("os").environ.get("SESSION_SECRET", "change-me-in-prod"),
)
app.include_router(auth_router)

store = Store()

# ── Agents ──


@app.get("/api/agents")
def list_agents() -> list[AgentDefinition]:
    return store.list_agents()


@app.get("/api/agents/{agent_id}")
def get_agent(agent_id: str) -> AgentDefinition:
    agent = store.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "agent not found")
    return agent


@app.post("/api/agents", status_code=201)
def create_agent(body: AgentCreate) -> AgentDefinition:
    agent = AgentDefinition(**body.model_dump())
    return store.create_agent(agent)


@app.patch("/api/agents/{agent_id}")
def update_agent(agent_id: str, body: AgentUpdate) -> AgentDefinition:
    agent = store.update_agent(agent_id, body.model_dump(exclude_unset=True))
    if not agent:
        raise HTTPException(404, "agent not found")
    return agent


@app.delete("/api/agents/{agent_id}", status_code=204)
def delete_agent(agent_id: str) -> None:
    if not store.delete_agent(agent_id):
        raise HTTPException(404, "agent not found")


# ── Sessions ──


@app.get("/api/sessions")
def list_sessions(agent_id: str | None = None) -> list[SessionMeta]:
    return store.list_sessions(agent_id)


@app.post("/api/sessions", status_code=201)
def create_session(body: dict) -> SessionMeta:
    agent_id = body.get("agent_id")
    if not agent_id or not store.get_agent(agent_id):
        raise HTTPException(400, "valid agent_id required")
    meta = SessionMeta(agent_id=agent_id)
    return store.create_session(meta)


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str) -> SessionDetail:
    meta = store.get_session_meta(session_id)
    if not meta:
        raise HTTPException(404, "session not found")
    messages = store.get_messages(session_id)
    return SessionDetail(**meta.model_dump(), messages=messages)


@app.delete("/api/sessions/{session_id}", status_code=204)
def delete_session(session_id: str) -> None:
    if not store.delete_session(session_id):
        raise HTTPException(404, "session not found")


# ── Chat (SSE) ──


@app.post("/api/sessions/{session_id}/chat")
async def chat(session_id: str, body: dict) -> StreamingResponse:
    prompt = body.get("message", "").strip()
    if not prompt:
        raise HTTPException(400, "message required")

    meta = store.get_session_meta(session_id)
    if not meta:
        raise HTTPException(404, "session not found")

    agent_def = store.get_agent(meta.agent_id)
    if not agent_def:
        raise HTTPException(404, "agent not found")

    ui_prompt = body.get("ui_prompt", "")

    user_msg = Message(role=Role.USER, content=prompt)
    store.append_message(session_id, user_msg)
    history = store.get_messages(session_id)

    async def event_stream():
        full_response = []
        try:
            async for chunk in run_turn(
                agent_def, history[:-1], prompt, ui_prompt=ui_prompt
            ):
                full_response.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        if full_response:
            agent_msg = Message(role=Role.AGENT, content="".join(full_response))
            store.append_message(session_id, agent_msg)
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── Static files (built frontend) ──

web_dist = Path(__file__).parent.parent.parent / "web" / "dist"
if web_dist.exists():
    app.mount("/", StaticFiles(directory=str(web_dist), html=True), name="static")


def run():
    import uvicorn

    uvicorn.run("aissist.app:app", host="0.0.0.0", port=8000, reload=True)
