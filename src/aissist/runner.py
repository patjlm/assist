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
        app_name="aissist",
        user_id="web",
    )

    runner = Runner(
        app_name="aissist",
        agent=agent,
        session_service=session_service,
    )

    for msg in history:
        role = "user" if msg.role == Role.USER else "model"
        content = types.Content(
            role=role,
            parts=[types.Part.from_text(text=msg.content)],
        )
        session.events.append(Event(author=role, content=content))

    new_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=user_message)],
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
