"""Normalizes what stores publish (feed, JSON-LD, UCP) into the same compact
facts, so the agent compares stores on equal terms whatever the source."""

from __future__ import annotations

from datetime import date
from typing import Any

from ..errand import add_business_days, spanish_date


def arrival(run_date: date, handling_max: int | None, transit_max: int | None) -> dict[str, Any]:
    if handling_max is None or transit_max is None:
        return {"delivery": "no publicado"}
    days = handling_max + transit_max
    d = add_business_days(run_date, days)
    return {"delivery_business_days_max": days, "arrives_by": f"{d.isoformat()} ({spanish_date(d)})"}


def offer(
    *,
    run_date: date,
    source: str,
    name: str,
    product_id: str,
    category_text: str,
    price: float | None,
    currency: str | None,
    sizes: dict[str, dict[str, Any]],
    handling_max: int | None,
    transit_max: int | None,
    shipping_price: float | None = None,
    url: str | None = None,
) -> dict[str, Any]:
    """sizes: {"9": {"in_stock": True, "variant_id": "SND-001-9"}}"""
    return {
        "source": source,
        "product": name,
        "product_id": product_id,
        "category_text": category_text,
        "price": f"{price:.2f} {currency}" if price is not None else "no publicado",
        "shipping": f"{shipping_price:.2f} {currency}" if shipping_price is not None else "no publicado",
        "sizes_in_stock": [s for s, v in sizes.items() if v.get("in_stock")],
        # Compact on purpose: fewer tokens per turn means faster model calls.
        "variant_ids": {s: v["variant_id"] for s, v in sizes.items() if v.get("variant_id") and v.get("in_stock")},
        **arrival(run_date, handling_max, transit_max),
        **({"url": url} if url else {}),
    }
