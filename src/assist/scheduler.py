"""Background scheduler — runs due schedules every 60 seconds."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from croniter import croniter

from .models import Message, Role, ScheduleDefinition, SessionMeta
from .realms import REALMS_DIR
from .runner import run_turn
from .store import Store

logger = logging.getLogger(__name__)
TICK_INTERVAL = 60


async def scheduler_loop() -> None:
    while True:
        try:
            await _tick()
        except Exception:
            logger.exception("scheduler tick failed")
        await asyncio.sleep(TICK_INTERVAL)


async def _tick() -> None:
    if not REALMS_DIR.exists():
        return
    now = datetime.now(timezone.utc)
    for realm_dir in REALMS_DIR.iterdir():
        if not realm_dir.is_dir():
            continue
        schedules_dir = realm_dir / "schedules"
        if not schedules_dir.exists():
            continue
        store = Store(data_dir=str(realm_dir))
        for path in schedules_dir.glob("*.json"):
            sched = ScheduleDefinition.model_validate_json(path.read_text())
            if not sched.enabled or not sched.next_run_at:
                continue
            if sched.next_run_at <= now:
                asyncio.create_task(_execute_schedule(store, sched))


async def _execute_schedule(store: Store, schedule: ScheduleDefinition) -> None:
    try:
        agent_def = store.get_agent(schedule.agent_id)
        if not agent_def:
            logger.warning(
                "schedule %s: agent %s not found, skipping",
                schedule.id,
                schedule.agent_id,
            )
            return

        expanded_prompt = _expand_prompt(schedule.prompt)

        meta = SessionMeta(
            agent_id=schedule.agent_id,
            title=f"Scheduled: {schedule.prompt[:60]}",
            schedule_id=schedule.id,
        )
        store.create_session(meta)
        store.append_message(meta.id, Message(role=Role.USER, content=expanded_prompt))

        chunks: list[str] = []
        async for chunk in run_turn(agent_def, [], expanded_prompt):
            chunks.append(chunk)

        if chunks:
            store.append_message(
                meta.id, Message(role=Role.AGENT, content="".join(chunks))
            )

        now = datetime.now(timezone.utc)
        updates: dict = {"last_run_at": now, "last_session_id": meta.id}

        if schedule.one_time:
            updates["enabled"] = False
            updates["next_run_at"] = None
        else:
            updates["next_run_at"] = _compute_next_run(schedule, now)

        store.update_schedule(schedule.id, updates)
        logger.info("schedule %s executed, session %s", schedule.id, meta.id)

    except Exception:
        logger.exception("schedule %s execution failed", schedule.id)


def _expand_prompt(template: str) -> str:
    now = datetime.now(timezone.utc)
    replacements = {
        "{{now}}": now.strftime("%Y-%m-%d %H:%M UTC"),
        "{{date}}": now.strftime("%Y-%m-%d"),
        "{{time}}": now.strftime("%H:%M UTC"),
        "{{day_of_week}}": now.strftime("%A"),
        "{{iso_date}}": now.isoformat(),
    }
    result = template
    for key, value in replacements.items():
        result = result.replace(key, value)
    return result


def compute_next_run(
    schedule: ScheduleDefinition, after: datetime | None = None
) -> datetime:
    return _compute_next_run(schedule, after or datetime.now(timezone.utc))


def _compute_next_run(schedule: ScheduleDefinition, after: datetime) -> datetime:
    if schedule.cron_expression:
        return (
            croniter(schedule.cron_expression, after)
            .get_next(datetime)
            .replace(tzinfo=timezone.utc)
        )
    if schedule.interval_seconds:
        return after + timedelta(seconds=schedule.interval_seconds)
    raise ValueError("schedule has neither interval_seconds nor cron_expression")
