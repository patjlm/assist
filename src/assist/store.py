"""File-based persistence for agents (JSON) and sessions (JSONL)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .models import AgentDefinition, Message, SessionMeta

DEFAULT_SESSION_TTL_DAYS = 7


class Store:
    def __init__(self, data_dir: str | Path = "data"):
        self.data_dir = Path(data_dir)
        self.agents_dir = self.data_dir / "agents"
        self.sessions_dir = self.data_dir / "sessions"
        self.agents_dir.mkdir(parents=True, exist_ok=True)
        self.sessions_dir.mkdir(parents=True, exist_ok=True)

    # ── agents ──

    def _agent_path(self, agent_id: str) -> Path:
        return self.agents_dir / f"{agent_id}.json"

    def list_agents(self) -> list[AgentDefinition]:
        agents = []
        for p in sorted(self.agents_dir.glob("*.json")):
            agents.append(AgentDefinition.model_validate_json(p.read_text()))
        return agents

    def get_agent(self, agent_id: str) -> AgentDefinition | None:
        p = self._agent_path(agent_id)
        if not p.exists():
            return None
        return AgentDefinition.model_validate_json(p.read_text())

    def create_agent(self, agent: AgentDefinition) -> AgentDefinition:
        self._agent_path(agent.id).write_text(
            json.dumps(agent.model_dump(mode="json"), indent=2)
        )
        return agent

    def update_agent(self, agent_id: str, updates: dict) -> AgentDefinition | None:
        agent = self.get_agent(agent_id)
        if not agent:
            return None
        data = agent.model_dump()
        data.update({k: v for k, v in updates.items() if v is not None})
        updated = AgentDefinition.model_validate(data)
        self._agent_path(agent_id).write_text(
            json.dumps(updated.model_dump(mode="json"), indent=2)
        )
        return updated

    def delete_agent(self, agent_id: str) -> bool:
        p = self._agent_path(agent_id)
        if not p.exists():
            return False
        p.unlink()
        return True

    # ── sessions ──

    def _meta_path(self, session_id: str) -> Path:
        return self.sessions_dir / f"{session_id}.meta.json"

    def _messages_path(self, session_id: str) -> Path:
        return self.sessions_dir / f"{session_id}.jsonl"

    def create_session(self, meta: SessionMeta) -> SessionMeta:
        self._meta_path(meta.id).write_text(
            json.dumps(meta.model_dump(mode="json"), indent=2)
        )
        self._messages_path(meta.id).touch()
        return meta

    def list_sessions(self, agent_id: str | None = None) -> list[SessionMeta]:
        agents = {a.id: a for a in self.list_agents()}
        now = datetime.now(timezone.utc)
        result = []
        for p in sorted(self.sessions_dir.glob("*.meta.json"), reverse=True):
            meta = SessionMeta.model_validate_json(p.read_text())
            if agent_id and meta.agent_id != agent_id:
                continue
            agent = agents.get(meta.agent_id)
            ttl_days = DEFAULT_SESSION_TTL_DAYS
            if agent and agent.session_ttl_days is not None:
                ttl_days = agent.session_ttl_days
            if ttl_days > 0:
                age_seconds = (now - meta.updated_at).total_seconds()
                if age_seconds > ttl_days * 86400:
                    self.delete_session(meta.id)
                    continue
            result.append(meta)
        return result

    def get_session_meta(self, session_id: str) -> SessionMeta | None:
        p = self._meta_path(session_id)
        if not p.exists():
            return None
        return SessionMeta.model_validate_json(p.read_text())

    def update_session(self, session_id: str, updates: dict) -> SessionMeta | None:
        meta = self.get_session_meta(session_id)
        if not meta:
            return None
        data = meta.model_dump(mode="json")
        data.update({k: v for k, v in updates.items() if v is not None})
        updated = SessionMeta.model_validate(data)
        self._meta_path(session_id).write_text(
            json.dumps(updated.model_dump(mode="json"), indent=2)
        )
        return updated

    def get_messages(self, session_id: str) -> list[Message]:
        p = self._messages_path(session_id)
        if not p.exists():
            return []
        messages = []
        for line in p.read_text().splitlines():
            if line.strip():
                messages.append(Message.model_validate_json(line))
        return messages

    def append_message(self, session_id: str, message: Message) -> None:
        with self._messages_path(session_id).open("a") as f:
            f.write(message.model_dump_json() + "\n")
        meta = self.get_session_meta(session_id)
        if meta:
            data = meta.model_dump(mode="json")
            if not meta.title and message.role == "user":
                data["title"] = message.content[:80]
            data["updated_at"] = message.timestamp.isoformat()
            self._meta_path(session_id).write_text(json.dumps(data, indent=2))

    def count_sessions_for_agent(self, agent_id: str) -> int:
        count = 0
        for p in self.sessions_dir.glob("*.meta.json"):
            meta = SessionMeta.model_validate_json(p.read_text())
            if meta.agent_id == agent_id:
                count += 1
        return count

    def delete_sessions_for_agent(self, agent_id: str) -> int:
        deleted = 0
        for p in list(self.sessions_dir.glob("*.meta.json")):
            meta = SessionMeta.model_validate_json(p.read_text())
            if meta.agent_id == agent_id:
                session_id = meta.id
                p.unlink()
                self._messages_path(session_id).unlink(missing_ok=True)
                deleted += 1
        return deleted

    def delete_session(self, session_id: str) -> bool:
        meta_p = self._meta_path(session_id)
        msg_p = self._messages_path(session_id)
        if not meta_p.exists():
            return False
        meta_p.unlink()
        msg_p.unlink(missing_ok=True)
        return True
