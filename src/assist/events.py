"""Realm-scoped event bus for SSE push notifications."""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict


class RealmEventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[str | None]]] = defaultdict(set)

    def subscribe(self, realm_id: str) -> asyncio.Queue[str | None]:
        q: asyncio.Queue[str | None] = asyncio.Queue()
        self._subscribers[realm_id].add(q)
        return q

    def unsubscribe(self, realm_id: str, q: asyncio.Queue[str | None]) -> None:
        self._subscribers[realm_id].discard(q)
        if not self._subscribers[realm_id]:
            del self._subscribers[realm_id]

    def publish(self, realm_id: str, event_type: str, data: dict | None = None) -> None:
        payload = json.dumps({"type": event_type, **(data or {})})
        for q in list(self._subscribers.get(realm_id, [])):
            q.put_nowait(payload)


bus = RealmEventBus()
