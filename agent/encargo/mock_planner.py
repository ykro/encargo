"""MOCK_AI=1: a deterministic planner that walks the same tools as the LLM agent.

Tests and rehearsals run without network access to a model; the stores, the
checklist, the guardrails and the mandate flow are all the real ones.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from .run_context import RunContext
from .tools import approval, browser, checklist, discovery, product_feed, ucp_client


def _price(offer: dict[str, Any]) -> float | None:
    p = offer.get("price", "")
    try:
        return float(p.split()[0])
    except (ValueError, IndexError):
        return None


def _evaluate(ctx: RunContext, offer: dict[str, Any]) -> dict[str, tuple[str, str]]:
    result: dict[str, tuple[str, str]] = {}
    for c in ctx.conditions:
        if c.kind == "category":
            ok = c.value in offer["category_text"].lower()
            result[c.id] = ("met" if ok else "not_met", f"Categoría publicada: {offer['category_text']}.")
        elif c.kind == "size":
            ok = c.value in offer["sizes_in_stock"]
            result[c.id] = ("met" if ok else "not_met", f"Talla {c.value} {'disponible' if ok else 'no disponible'}.")
        elif c.kind == "max_price_usd":
            price = _price(offer)
            ok = price is not None and price < float(c.value)
            result[c.id] = ("met" if ok else "not_met", f"Precio publicado: {offer['price']}.")
        elif c.kind == "deliver_by":
            arrives = offer.get("arrives_by", "")[:10]
            ok = bool(arrives) and date.fromisoformat(arrives) <= date.fromisoformat(c.value)
            result[c.id] = ("met" if ok else "not_met", f"Llega {offer.get('arrives_by', 'sin fecha')}.")
    return result


async def run_mock(ctx: RunContext) -> str:
    best: dict[str, tuple[dict[str, Any], float]] = {}
    for store in ctx.stores:
        await ctx.emit("thought", text=f"Reviso qué publica {store} para máquinas.")
        info = await discovery.inspect_store(ctx, store)
        await ctx.emit("observation", tool="inspect_store", store=store, data=info)
        offers: list[dict[str, Any]] = []
        if info["product_feed"] != "no encontrado":
            feed = await product_feed.read_product_feed(ctx, info["product_feed"])
            await ctx.emit("observation", tool="read_product_feed", store=store, data=feed)
            offers = feed.get("products", [])
        elif isinstance(info["ucp_profile"], dict):
            found = await ucp_client.search_catalog(ctx, store, "")
            offers = found.get("products", [])
        else:
            page = await browser.browse_page(ctx, store)
            await ctx.emit("observation", tool="browse_page", store=store, data=page)

        if not offers:
            for c in ctx.conditions:
                await checklist.record_check(ctx, store, c.id, "not_verifiable", "La tienda no publica este dato de forma legible para máquinas.")
            continue
        scored = []
        for o in offers:
            ev = _evaluate(ctx, o)
            scored.append((sum(s == "met" for s, _ in ev.values()), -(_price(o) or 1e9), o, ev))
        scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
        _, _, chosen, ev = scored[0]
        for cid, (status, evidence) in ev.items():
            await checklist.record_check(ctx, store, cid, status, f"{chosen['product']}: {evidence}")
        if ctx.all_met(store):
            best[store] = (chosen, _price(chosen) or 0)

    if not best:
        return "Ninguna tienda cumple todas las condiciones que puedo verificar; no compro."
    store, (chosen, price) = min(best.items(), key=lambda kv: kv[1][1])
    size = next(c.value for c in ctx.conditions if c.kind == "size")
    checkout = await ucp_client.create_checkout(ctx, store, chosen["variant_ids"][size])
    if not checkout.get("created"):
        return f"No pude crear el checkout: {checkout}"
    result = await approval.request_payment_approval(
        ctx, store, checkout["checkout_id"], f"{chosen['product']} cumple todo y es la opción verificable más barata ({price:.0f} USD)."
    )
    return "Pedí tu aprobación para pagar." if result.get("requested") else f"No pude pedir la aprobación: {result}"
