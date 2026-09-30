"""Run state storage: Firestore in the cloud, in-memory for tests (same interface)."""

from __future__ import annotations

from functools import lru_cache

from ..config import settings
from .base import TERMINAL_STATUSES, RunStore
from .memory import MemoryRunStore

__all__ = ["RunStore", "MemoryRunStore", "TERMINAL_STATUSES", "default_store"]


@lru_cache(maxsize=1)
def default_store() -> RunStore:
    s = settings()
    if s.run_store == "firestore":
        from .firestore import FirestoreRunStore

        return FirestoreRunStore(project=s.project, database=s.firestore_database)
    return MemoryRunStore()
