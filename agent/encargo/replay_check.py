"""What makes a Plan B recording valid: it was made from today's catalog and errand.

A recording does not go stale with the calendar: the presenter banner says the day it
was recorded, so its delivery dates read as that day's. It goes stale when what it
captured changes: the catalog (products, prices, stock, copy) or the errand text.
`make record-replay` stores this fingerprint and `make preflight` compares it.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from .errand import DEFAULT_ERRAND

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "catalog" / "catalog.json"
REPLAYS_DIR = ROOT / "app" / "public" / "replays"


def fingerprint(catalog: bytes | None = None, errand: str = DEFAULT_ERRAND) -> str:
    h = hashlib.sha256()
    h.update(catalog if catalog is not None else CATALOG.read_bytes())
    h.update(b"\0")
    h.update(errand.encode())
    return h.hexdigest()[:16]


def problems(body: dict, current: str) -> list[str]:
    """Spanish reasons why a recording can't be shown on stage (empty = valid)."""
    out: list[str] = []
    if body.get("fingerprint") != current:
        out.append("el catálogo o el encargo cambiaron desde que se grabó")
    events = body.get("events") or []
    types = [e.get("type") for e in events]
    if "order_confirmed" not in types:
        out.append("la grabación no termina en un pedido confirmado")
    if "mandate_signed" not in types:
        out.append("la grabación no tiene la firma del mandato")
    return out
