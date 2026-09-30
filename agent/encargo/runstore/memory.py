"""In-memory RunStore: same behavior as Firestore, no network. Used by tests and MOCK_AI rehearsals."""

from __future__ import annotations

import copy
from collections import defaultdict
from typing import Any


class MemoryRunStore:
    def __init__(self) -> None:
        self.runs: dict[str, dict[str, Any]] = {}
        self.events: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.mandates: dict[str, dict[str, Any]] = {}
        self.orders: list[dict[str, Any]] = []
        self.screenshots: dict[str, dict[str, Any]] = {}

    async def create_run(self, run: dict[str, Any]) -> None:
        self.runs[run["id"]] = copy.deepcopy(run)

    async def get_run(self, run_id: str) -> dict[str, Any] | None:
        run = self.runs.get(run_id)
        return copy.deepcopy(run) if run else None

    async def update_run(self, run_id: str, fields: dict[str, Any]) -> None:
        self.runs[run_id].update(copy.deepcopy(fields))

    async def append_event(self, run_id: str, event: dict[str, Any]) -> int:
        seq = len(self.events[run_id]) + 1
        self.events[run_id].append({**copy.deepcopy(event), "seq": seq})
        return seq

    async def list_events(self, run_id: str, after_seq: int = 0) -> list[dict[str, Any]]:
        return [copy.deepcopy(e) for e in self.events.get(run_id, []) if e["seq"] > after_seq]

    async def save_mandate(self, mandate: dict[str, Any]) -> None:
        self.mandates[mandate["id"]] = copy.deepcopy(mandate)

    async def get_mandate(self, mandate_id: str) -> dict[str, Any] | None:
        m = self.mandates.get(mandate_id)
        return copy.deepcopy(m) if m else None

    async def update_mandate(self, mandate_id: str, fields: dict[str, Any]) -> None:
        self.mandates[mandate_id].update(copy.deepcopy(fields))

    async def save_order(self, order: dict[str, Any]) -> None:
        self.orders.append(copy.deepcopy(order))

    async def list_orders(self) -> list[dict[str, Any]]:
        return copy.deepcopy(self.orders)

    async def save_screenshot(self, shot_id: str, data: dict[str, Any]) -> None:
        self.screenshots[shot_id] = data

    async def get_screenshot(self, shot_id: str) -> dict[str, Any] | None:
        return self.screenshots.get(shot_id)

    async def reset(self) -> None:
        self.__init__()
