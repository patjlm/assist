"""File-based persistence for agents (JSON) and sessions (JSONL)."""

from __future__ import annotations

import json
from pathlib import Path

from .models import AgentDefinition, Message, SessionMeta


class Store:
    def __init__(self, data_dir: str | Path = "data"):
        self.data_dir = Path(data_dir)
        self.agents_file = self.data_dir / "agents.json"
        self.sessions_dir = self.data_dir / "sessions"
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        if not self.agents_file.exists():
            self.agents_file.write_text("[]")

    # ── agents ──

    def _read_agents(self) -> list[AgentDefinition]:
        raw = json.loads(self.agents_file.read_text())
        return [AgentDefinition.model_validate(a) for a in raw]

    def _write_agents(self, agents: list[AgentDefinition]) -> None:
        self.agents_file.write_text(
            json.dumps([a.model_dump(mode="json") for a in agents], indent=2)
        )

    def list_agents(self) -> list[AgentDefinition]:
        return self._read_agents()

    def get_agent(self, agent_id: str) -> AgentDefinition | None:
        for a in self._read_agents():
            if a.id == agent_id:
                return a
        return None

    def create_agent(self, agent: AgentDefinition) -> AgentDefinition:
        agents = self._read_agents()
        agents.append(agent)
        self._write_agents(agents)
        return agent

    def update_agent(self, agent_id: str, updates: dict) -> AgentDefinition | None:
        agents = self._read_agents()
        for i, a in enumerate(agents):
            if a.id == agent_id:
                data = a.model_dump()
                data.update({k: v for k, v in updates.items() if v is not None})
                agents[i] = AgentDefinition.model_validate(data)
                self._write_agents(agents)
                return agents[i]
        return None

    def delete_agent(self, agent_id: str) -> bool:
        agents = self._read_agents()
        filtered = [a for a in agents if a.id != agent_id]
        if len(filtered) == len(agents):
            return False
        self._write_agents(filtered)
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
        result = []
        for p in sorted(self.sessions_dir.glob("*.meta.json"), reverse=True):
            meta = SessionMeta.model_validate_json(p.read_text())
            if agent_id and meta.agent_id != agent_id:
                continue
            result.append(meta)
        return result

    def get_session_meta(self, session_id: str) -> SessionMeta | None:
        p = self._meta_path(session_id)
        if not p.exists():
            return None
        return SessionMeta.model_validate_json(p.read_text())

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

    def delete_session(self, session_id: str) -> bool:
        meta_p = self._meta_path(session_id)
        msg_p = self._messages_path(session_id)
        if not meta_p.exists():
            return False
        meta_p.unlink()
        msg_p.unlink(missing_ok=True)
        return True
