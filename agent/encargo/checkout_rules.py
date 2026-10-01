"""Deterministic last check before asking the person to pay.

The checklist says the *product* fits; this checks that the *checkout the store
signed* is exactly what the errand asked for — one pair, the right size, under
budget, arriving by the deadline. No model judgment is involved.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from .errand import Condition


def checkout_problems(checkout: dict[str, Any], conditions: list[Condition]) -> list[str]:
    by_kind = {c.kind: c for c in conditions}
    problems: list[str] = []
    items = checkout.get("line_items") or []
    if len(items) != 1 or items[0].get("quantity") != 1:
        problems.append("El checkout debe tener exactamente un par.")
    size = by_kind.get("size")
    if size and items:
        item = items[0].get("item") or {}
        if not (str(item.get("id", "")).endswith(f"-{size.value}") or f"talla {size.value}" in str(item.get("title", ""))):
            problems.append(f"La variante del checkout no es la talla {size.value}.")
    max_price = by_kind.get("max_price_usd")
    total = next((t.get("amount") for t in checkout.get("totals", []) if t.get("type") == "total"), None)
    if max_price:
        if total is None or checkout.get("currency") != "USD":
            problems.append("El checkout no publica un total en USD.")
        elif total / 100 >= float(max_price.value):
            problems.append(f"El total ({total / 100:.2f} USD) no es menor a {max_price.value} USD.")
    deadline = by_kind.get("deliver_by")
    if deadline:
        latest = None
        for method in (checkout.get("fulfillment") or {}).get("methods", []):
            for group in method.get("groups", []):
                for opt in group.get("options", []):
                    if opt.get("id") == group.get("selected_option_id"):
                        latest = opt.get("latest_fulfillment_time")
        if not latest:
            problems.append("El checkout no publica la fecha de entrega.")
        elif date.fromisoformat(latest[:10]) > date.fromisoformat(deadline.value):
            problems.append(f"El checkout entrega el {latest[:10]}, después del plazo ({deadline.value}).")
    return problems
