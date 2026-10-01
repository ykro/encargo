"""Everything one run knows while it works: the errand, the stores, what it has
seen, the checklist so far and the event stream the presenter view follows."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any
from urllib.parse import urlparse

import httpx

from .errand import Condition
from .runstore import RunStore

# A run is looked up by id from inside ADK tools (they only receive a ToolContext).
_ACTIVE: dict[str, "RunContext"] = {}

REQUIRED_KINDS = {"category", "size", "max_price_usd", "deliver_by"}

STATUS_LABEL = {"met": "cumple", "not_met": "no cumple", "not_verifiable": "no verificable"}


@dataclass
class RunContext:
    run_id: str
    errand: str
    stores: list[str]
    conditions: list[Condition]
    run_date: date
    store: RunStore
    http: httpx.AsyncClient
    agent_profile_url: str
    checklist: dict[str, dict[str, dict[str, str]]] = field(default_factory=dict)
    profiles: dict[str, dict[str, Any]] = field(default_factory=dict)
    checkouts: dict[str, dict[str, Any]] = field(default_factory=dict)
    mandate_id: str | None = None
    started: float = field(default_factory=time.monotonic)

    def __post_init__(self) -> None:
        _ACTIVE[self.run_id] = self

    def close(self) -> None:
        _ACTIVE.pop(self.run_id, None)

    @staticmethod
    def get(run_id: str) -> "RunContext":
        return _ACTIVE[run_id]

    def store_url(self, url: str) -> str:
        """Normalizes any URL to one of the run's store base URLs."""
        host = urlparse(url if "://" in url else f"http://{url}").netloc
        for s in self.stores:
            if urlparse(s).netloc == host:
                return s
        raise ValueError(f"{url} no es una de las tiendas del encargo: {', '.join(self.stores)}")

    def condition(self, condition_id: str) -> Condition:
        for c in self.conditions:
            if c.id == condition_id:
                return c
        raise ValueError(f"Condición desconocida: {condition_id}. Usa una de: {[c.id for c in self.conditions]}")

    @property
    def deadline(self) -> date | None:
        for c in self.conditions:
            if c.kind == "deliver_by":
                return date.fromisoformat(c.value)
        return None

    async def emit(self, type_: str, **data: Any) -> None:
        await self.store.append_event(
            self.run_id, {"type": type_, "t": round(time.monotonic() - self.started, 2), "at": time.time(), **data}
        )

    def all_met(self, store_url: str) -> bool:
        """Every one of the four errand conditions was recorded as met at this store.

        An errand that did not yield all four conditions can never be bought.
        """
        if {c.kind for c in self.conditions} != REQUIRED_KINDS:
            return False
        checks = self.checklist.get(store_url, {})
        return all(checks.get(c.id, {}).get("status") == "met" for c in self.conditions)
