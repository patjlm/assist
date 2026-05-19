"""ADK-based agent runner. Turns stored agent definitions into live ADK agents."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.events.event import Event
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from .models import AgentDefinition, Message, Role
from .preferences import list_users


def _build_generate_config(
    agent_def: AgentDefinition,
) -> types.GenerateContentConfig | None:
    kwargs: dict[str, Any] = {}
    for field in (
        "temperature",
        "top_p",
        "top_k",
        "max_output_tokens",
        "stop_sequences",
        "presence_penalty",
        "frequency_penalty",
    ):
        val = getattr(agent_def, field)
        if val is not None:
            kwargs[field] = val
    return types.GenerateContentConfig(**kwargs) if kwargs else None


async def run_turn(
    agent_def: AgentDefinition,
    history: list[Message],
    user_message: str,
    ui_prompt: str = "",
    sender_email: str = "",
) -> AsyncIterator[str]:
    """Run one conversation turn. Yields text chunks as they arrive."""
    instruction = agent_def.system_prompt
    if ui_prompt:
        instruction = f"{ui_prompt}\n\n{instruction}"

    agent = LlmAgent(
        name=f"agent_{agent_def.id}",
        model=agent_def.model,
        instruction=instruction,
        global_instruction=agent_def.global_instruction,
        description=agent_def.description,
        include_contents=agent_def.include_contents,
        disallow_transfer_to_parent=agent_def.disallow_transfer_to_parent,
        disallow_transfer_to_peers=agent_def.disallow_transfer_to_peers,
        output_key=agent_def.output_key,
        generate_content_config=_build_generate_config(agent_def),
    )

    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name="assist",
        user_id="web",
    )

    runner = Runner(
        app_name="assist",
        agent=agent,
        session_service=session_service,
    )

    users_by_email = {u["email"]: u.get("name", u["email"]) for u in list_users()}

    def _format_user_text(msg: Message) -> str:
        if msg.actor_id:
            name = users_by_email.get(msg.actor_id, msg.actor_id)
            return f"[{name}]: {msg.content}"
        return msg.content

    multi_user_note = (
        "User messages are prefixed with [Name] to identify the speaker. "
        "Address participants by name when relevant. "
        "Do NOT prefix your own replies with [Name].\n\n"
    )
    base = agent.instruction if isinstance(agent.instruction, str) else ""
    agent.instruction = multi_user_note + base

    for msg in history:
        role = "user" if msg.role == Role.USER else "model"
        text = _format_user_text(msg) if msg.role == Role.USER else msg.content
        content = types.Content(
            role=role,
            parts=[types.Part.from_text(text=text)],
        )
        session.events.append(Event(author=role, content=content))

    new_message = types.Content(
        role="user",
        parts=[
            types.Part.from_text(
                text=_format_user_text(
                    Message(role=Role.USER, content=user_message, actor_id=sender_email)
                )
            )
        ],
    )

    async for event in runner.run_async(
        user_id="web",
        session_id=session.id,
        new_message=new_message,
    ):
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    yield part.text
