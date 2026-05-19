"""FastAPI application — REST API for agents/sessions + SSE chat."""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from croniter import croniter
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import StreamingResponse

from .auth import AuthMiddleware, get_current_user, router as auth_router
from .models import (
    AgentCreate,
    AgentDefinition,
    AgentUpdate,
    Message,
    Realm,
    RealmCreate,
    Role,
    ScheduleCreate,
    ScheduleDefinition,
    ScheduleUpdate,
    SessionDetail,
    SessionMeta,
    SessionUpdate,
    UserPreferences,
)
from .realms import (
    check_access,
    create_realm,
    delete_realm,
    ensure_personal_realm,
    get_realm,
    list_realms_for_user,
    update_realm,
    validate_realm_id,
)
from .preferences import get_preferences, set_preferences
from .runner import run_turn
from .scheduler import compute_next_run, _execute_schedule, scheduler_loop
from .store import Store

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(scheduler_loop())
    yield
    task.cancel()


app = FastAPI(title="assist", lifespan=lifespan)
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

User = Annotated[dict, Depends(get_current_user)]


def get_realm_store(
    realm_id: str,
    user: User,
) -> Store:
    try:
        validate_realm_id(realm_id)
    except ValueError:
        raise HTTPException(400, "invalid realm id")
    if not check_access(realm_id, user["email"]):
        raise HTTPException(403, "access denied")
    return Store(data_dir=f"data/realms/{realm_id}")


RealmStore = Annotated[Store, Depends(get_realm_store)]

# ── Realms ──


@app.get("/api/realms")
def list_realms(user: User) -> list[Realm]:
    ensure_personal_realm(user["email"], user.get("name", user["email"]))
    return list_realms_for_user(user["email"])


@app.post("/api/realms", status_code=201)
def create_realm_route(body: RealmCreate, user: User) -> Realm:
    existing = list_realms_for_user(user["email"])
    if any(r.name == body.name for r in existing):
        raise HTTPException(409, "a realm with that name already exists")
    realm = Realm(name=body.name, owner_email=user["email"])
    return create_realm(realm)


@app.get("/api/realms/{realm_id}")
def get_realm_route(realm_id: str, user: User) -> Realm:
    try:
        validate_realm_id(realm_id)
    except ValueError:
        raise HTTPException(400, "invalid realm id")
    realm = get_realm(realm_id)
    if not realm:
        raise HTTPException(404, "realm not found")
    if realm.owner_email != user["email"] and user["email"] not in realm.members:
        raise HTTPException(403, "access denied")
    return realm


@app.patch("/api/realms/{realm_id}")
def update_realm_route(realm_id: str, body: dict, user: User) -> Realm:
    try:
        validate_realm_id(realm_id)
    except ValueError:
        raise HTTPException(400, "invalid realm id")
    realm = get_realm(realm_id)
    if not realm:
        raise HTTPException(404, "realm not found")
    if realm.owner_email != user["email"]:
        raise HTTPException(403, "only owner can update realm")
    new_name = body.get("name")
    if new_name is not None:
        existing = list_realms_for_user(user["email"])
        if any(r.name == new_name and r.id != realm_id for r in existing):
            raise HTTPException(409, "a realm with that name already exists")
    updated = update_realm(realm_id, body)
    if not updated:
        raise HTTPException(404, "realm not found")
    return updated


@app.delete("/api/realms/{realm_id}", status_code=204)
def delete_realm_route(realm_id: str, user: User) -> None:
    try:
        validate_realm_id(realm_id)
    except ValueError:
        raise HTTPException(400, "invalid realm id")
    realm = get_realm(realm_id)
    if not realm:
        raise HTTPException(404, "realm not found")
    if realm.personal:
        raise HTTPException(400, "cannot delete personal realm")
    if realm.owner_email != user["email"]:
        raise HTTPException(403, "only owner can delete realm")
    delete_realm(realm_id)


# ── User preferences ──


@app.get("/api/preferences")
def get_prefs(user: User) -> UserPreferences:
    return get_preferences(user["email"])


@app.put("/api/preferences")
def update_prefs(body: UserPreferences, user: User) -> UserPreferences:
    return set_preferences(user["email"], body)


# ── Agents ──


@app.get("/api/realms/{realm_id}/agents")
def list_agents(store: RealmStore) -> list[AgentDefinition]:
    return store.list_agents()


@app.get("/api/realms/{realm_id}/agents/{agent_id}")
def get_agent(agent_id: str, store: RealmStore) -> AgentDefinition:
    agent = store.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "agent not found")
    return agent


@app.post("/api/realms/{realm_id}/agents", status_code=201)
def create_agent(body: AgentCreate, store: RealmStore) -> AgentDefinition:
    if any(a.name == body.name for a in store.list_agents()):
        raise HTTPException(409, "an agent with that name already exists")
    agent = AgentDefinition(**body.model_dump())
    return store.create_agent(agent)


@app.patch("/api/realms/{realm_id}/agents/{agent_id}")
def update_agent(
    agent_id: str, body: AgentUpdate, store: RealmStore
) -> AgentDefinition:
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates:
        if any(
            a.name == updates["name"] and a.id != agent_id for a in store.list_agents()
        ):
            raise HTTPException(409, "an agent with that name already exists")
    agent = store.update_agent(agent_id, updates)
    if not agent:
        raise HTTPException(404, "agent not found")
    return agent


@app.get("/api/realms/{realm_id}/agents/{agent_id}/session-count")
def agent_session_count(agent_id: str, store: RealmStore) -> dict:
    if not store.get_agent(agent_id):
        raise HTTPException(404, "agent not found")
    return {"count": store.count_sessions_for_agent(agent_id)}


@app.delete("/api/realms/{realm_id}/agents/{agent_id}", status_code=204)
def delete_agent(agent_id: str, store: RealmStore) -> None:
    if not store.delete_agent(agent_id):
        raise HTTPException(404, "agent not found")
    store.delete_sessions_for_agent(agent_id)
    store.delete_schedules_for_agent(agent_id)


# ── Sessions ──


@app.get("/api/realms/{realm_id}/sessions")
def list_sessions(store: RealmStore, agent_id: str | None = None) -> list[SessionMeta]:
    return store.list_sessions(agent_id)


@app.post("/api/realms/{realm_id}/sessions", status_code=201)
def create_session(body: dict, store: RealmStore) -> SessionMeta:
    agent_id = body.get("agent_id")
    if not agent_id or not store.get_agent(agent_id):
        raise HTTPException(400, "valid agent_id required")
    meta = SessionMeta(agent_id=agent_id)
    return store.create_session(meta)


@app.get("/api/realms/{realm_id}/sessions/{session_id}")
def get_session(session_id: str, store: RealmStore) -> SessionDetail:
    meta = store.get_session_meta(session_id)
    if not meta:
        raise HTTPException(404, "session not found")
    messages = store.get_messages(session_id)
    return SessionDetail(**meta.model_dump(), messages=messages)


@app.patch("/api/realms/{realm_id}/sessions/{session_id}")
def update_session(
    session_id: str, body: SessionUpdate, store: RealmStore
) -> SessionMeta:
    updated = store.update_session(session_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(404, "session not found")
    return updated


@app.delete("/api/realms/{realm_id}/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, store: RealmStore) -> None:
    if not store.delete_session(session_id):
        raise HTTPException(404, "session not found")


# ── Schedules ──


@app.get("/api/realms/{realm_id}/agents/{agent_id}/schedules")
def list_schedules(agent_id: str, store: RealmStore) -> list[ScheduleDefinition]:
    if not store.get_agent(agent_id):
        raise HTTPException(404, "agent not found")
    return store.list_schedules(agent_id)


@app.post("/api/realms/{realm_id}/agents/{agent_id}/schedules", status_code=201)
def create_schedule(
    agent_id: str, body: ScheduleCreate, store: RealmStore
) -> ScheduleDefinition:
    if not store.get_agent(agent_id):
        raise HTTPException(404, "agent not found")
    if not body.interval_seconds and not body.cron_expression:
        raise HTTPException(400, "interval_seconds or cron_expression required")
    if body.interval_seconds and body.cron_expression:
        raise HTTPException(400, "set interval_seconds or cron_expression, not both")
    if body.cron_expression and not croniter.is_valid(body.cron_expression):
        raise HTTPException(400, "invalid cron expression")

    schedule = ScheduleDefinition(agent_id=agent_id, **body.model_dump())
    now = datetime.now(timezone.utc)
    schedule.next_run_at = compute_next_run(schedule, now)
    return store.create_schedule(schedule)


@app.get("/api/realms/{realm_id}/schedules/{schedule_id}")
def get_schedule(schedule_id: str, store: RealmStore) -> ScheduleDefinition:
    sched = store.get_schedule(schedule_id)
    if not sched:
        raise HTTPException(404, "schedule not found")
    return sched


@app.patch("/api/realms/{realm_id}/schedules/{schedule_id}")
def update_schedule(
    schedule_id: str, body: ScheduleUpdate, store: RealmStore
) -> ScheduleDefinition:
    updates = body.model_dump(exclude_unset=True)
    cron = updates.get("cron_expression")
    if cron is not None and not croniter.is_valid(cron):
        raise HTTPException(400, "invalid cron expression")
    sched = store.update_schedule(schedule_id, updates)
    if not sched:
        raise HTTPException(404, "schedule not found")
    if "interval_seconds" in updates or "cron_expression" in updates:
        now = datetime.now(timezone.utc)
        store.update_schedule(
            schedule_id, {"next_run_at": compute_next_run(sched, now)}
        )
        sched = store.get_schedule(schedule_id)
    return sched  # type: ignore[return-value]


@app.delete("/api/realms/{realm_id}/schedules/{schedule_id}", status_code=204)
def delete_schedule(schedule_id: str, store: RealmStore) -> None:
    if not store.delete_schedule(schedule_id):
        raise HTTPException(404, "schedule not found")


@app.post("/api/realms/{realm_id}/schedules/{schedule_id}/run")
async def run_schedule(schedule_id: str, store: RealmStore) -> dict:
    sched = store.get_schedule(schedule_id)
    if not sched:
        raise HTTPException(404, "schedule not found")
    await _execute_schedule(store, sched)
    sched = store.get_schedule(schedule_id)
    return {"session_id": sched.last_session_id if sched else None}


# ── Chat (SSE) ──


@app.post("/api/realms/{realm_id}/sessions/{session_id}/chat")
async def chat(session_id: str, body: dict, store: RealmStore) -> StreamingResponse:
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

    uvicorn.run("assist.app:app", host="0.0.0.0", port=8000, reload=True)
