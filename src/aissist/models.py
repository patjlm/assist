from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class AgentDefinition(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    name: str
    description: str = ""
    system_prompt: str
    global_instruction: str = ""
    model: str = "gemini-2.5-flash"
    temperature: float | None = None
    top_p: float | None = None
    top_k: float | None = None
    max_output_tokens: int | None = None
    stop_sequences: list[str] | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    include_contents: Literal["default", "none"] = "default"
    disallow_transfer_to_parent: bool = False
    disallow_transfer_to_peers: bool = False
    output_key: str | None = None
    enable_ui: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentCreate(BaseModel):
    name: str
    description: str = ""
    system_prompt: str
    global_instruction: str = ""
    model: str = "gemini-2.5-flash"
    temperature: float | None = None
    top_p: float | None = None
    top_k: float | None = None
    max_output_tokens: int | None = None
    stop_sequences: list[str] | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    include_contents: Literal["default", "none"] = "default"
    disallow_transfer_to_parent: bool = False
    disallow_transfer_to_peers: bool = False
    output_key: str | None = None
    enable_ui: bool = False


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    global_instruction: str | None = None
    model: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    top_k: float | None = None
    max_output_tokens: int | None = None
    stop_sequences: list[str] | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    include_contents: Literal["default", "none"] | None = None
    disallow_transfer_to_parent: bool | None = None
    disallow_transfer_to_peers: bool | None = None
    output_key: str | None = None
    enable_ui: bool | None = None


class Role(str, Enum):
    USER = "user"
    AGENT = "agent"


class Message(BaseModel):
    role: Role
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionMeta(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    agent_id: str
    title: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionDetail(SessionMeta):
    messages: list[Message] = []
