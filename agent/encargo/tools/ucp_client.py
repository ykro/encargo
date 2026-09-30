"""UCP client: catalog search and checkout against the endpoint a store
declares in its /.well-known/ucp profile (REST binding)."""

from __future__ import annotations

from typing import Any

from ..ap2.merchant_signature import verify_merchant_authorization
from ..errand import spanish_date
from ..run_context import RunContext
from .discovery import load_ucp_profile, rest_endpoint
from .offer_facts import offer

CHECKOUT_CAP = "dev.ucp.shopping.checkout"
SEARCH_CAP = "dev.ucp.shopping.catalog.search"


def ucp_headers(ctx: RunContext) -> dict[str, str]:
    # Identifies the platform; the store fetches this profile to find our mandate key.
    return {"UCP-Agent": f'profile="{ctx.agent_profile_url}"', "content-type": "application/json"}


async def _endpoint(ctx: RunContext, store: str, capability: str) -> tuple[str | None, str | None]:
    profile = await load_ucp_profile(ctx, store)
    if not profile:
        return None, "La tienda no publica un perfil UCP (/.well-known/ucp)."
    if capability not in (profile.get("ucp", {}).get("capabilities") or {}):
        return None, f"El perfil UCP de la tienda no declara {capability}."
    endpoint = rest_endpoint(profile)
    return (endpoint, None) if endpoint else (None, "El perfil UCP no declara un endpoint REST.")


def _ucp_offer(ctx: RunContext, p: dict[str, Any]) -> dict[str, Any]:
    ship = (p.get("metadata") or {}).get("shipping") or {}
    price = (p.get("price_range") or {}).get("min") or {}
    sizes = {
        next((o.get("label") for o in v.get("options") or []), v.get("title", "")): {
            "in_stock": bool((v.get("availability") or {}).get("available")),
            "variant_id": v.get("id"),
        }
        for v in p.get("variants") or []
    }
    categories = [c.get("value") for c in p.get("categories") or [] if c.get("taxonomy") == "merchant"]
    terrain = (p.get("metadata") or {}).get("terrain")
    return offer(
        run_date=ctx.run_date,
        source="UCP catalog search",
        name=p.get("title", ""),
        product_id=p.get("id", ""),
        category_text=" / ".join([*categories, *([f"terreno={terrain}"] if terrain else [])]) or "no publicado",
        price=price.get("amount") / 100 if price.get("amount") is not None else None,
        currency=price.get("currency"),
        sizes=sizes,
        handling_max=(ship.get("handling_business_days") or {}).get("max"),
        transit_max=(ship.get("transit_business_days") or {}).get("max"),
        shipping_price=(ship.get("rate") or {}).get("amount", 0) / 100 if ship.get("rate") else None,
        url=p.get("url"),
    )


async def search_catalog(ctx: RunContext, store_url: str, query: str, max_price_usd: float | None = None) -> dict[str, Any]:
    store = ctx.store_url(store_url)
    endpoint, error = await _endpoint(ctx, store, SEARCH_CAP)
    if error:
        return {"store": store, "found": False, "error": error}
    body: dict[str, Any] = {"query": query, "pagination": {"limit": 20}}
    if max_price_usd is not None:
        body["filters"] = {"price": {"max": int(round(max_price_usd * 100))}}
    res = await ctx.http.post(f"{endpoint}/catalog/search", json=body, headers=ucp_headers(ctx))
    if res.status_code != 200:
        return {"store": store, "found": False, "status": res.status_code}
    products = res.json().get("products", [])
    return {"store": store, "found": True, "products": [_ucp_offer(ctx, p) for p in products]}


def summarize_checkout(checkout: dict[str, Any]) -> dict[str, Any]:
    totals = {t["type"]: t["amount"] / 100 for t in checkout.get("totals", [])}
    latest = None
    for method in (checkout.get("fulfillment") or {}).get("methods", []):
        for group in method.get("groups", []):
            for opt in group.get("options", []):
                if opt.get("id") == group.get("selected_option_id"):
                    latest = opt.get("latest_fulfillment_time")
    from datetime import date

    return {
        "checkout_id": checkout.get("id"),
        "status": checkout.get("status"),
        "items": [f"{li['item']['title']} x{li['quantity']}" for li in checkout.get("line_items", [])],
        "total": f"{totals.get('total', 0):.2f} {checkout.get('currency')}",
        "total_amount": totals.get("total"),
        "shipping": f"{totals.get('fulfillment', 0):.2f} {checkout.get('currency')}",
        "latest_delivery": f"{latest[:10]} ({spanish_date(date.fromisoformat(latest[:10]))})" if latest else "no publicado",
    }


async def create_checkout(ctx: RunContext, store_url: str, variant_id: str, quantity: int = 1) -> dict[str, Any]:
    store = ctx.store_url(store_url)
    endpoint, error = await _endpoint(ctx, store, CHECKOUT_CAP)
    if error:
        return {"store": store, "created": False, "error": error}
    res = await ctx.http.post(
        f"{endpoint}/checkout-sessions",
        json={"line_items": [{"item": {"id": variant_id}, "quantity": quantity}]},
        headers=ucp_headers(ctx),
    )
    checkout = res.json()
    if res.status_code >= 400 or "id" not in checkout:
        messages = [m.get("content") for m in checkout.get("messages", [])]
        return {"store": store, "created": False, "status": res.status_code, "messages": messages}
    ok, detail = verify_merchant_authorization(checkout, (ctx.profiles.get(store) or {}).get("keys") or [])
    if not ok:
        return {"store": store, "created": False, "error": detail}
    ctx.checkouts[checkout["id"]] = {"store": store, "endpoint": endpoint, "checkout": checkout}
    summary = summarize_checkout(checkout)
    await ctx.emit("checkout_created", store=store, **summary, merchant_signature="verificada")
    return {"store": store, "created": True, **summary, "merchant_signature": detail}
