"""What the agent sees, as compact events for the presenter's right column.

Every reading tool reports the facts it could extract — or that it found none.
The presenter never re-derives anything from raw HTML: it shows these events.
"""

from __future__ import annotations

from typing import Any

from ..run_context import RunContext

FACT_KEYS = ("product", "price", "category_text", "sizes_in_stock", "arrives_by")


def _compact(o: dict[str, Any]) -> dict[str, Any]:
    return {k: o.get(k) for k in FACT_KEYS if o.get(k) not in (None, "", "no publicado")}


async def sources(ctx: RunContext, store: str, info: dict[str, Any]) -> None:
    await ctx.emit(
        "agent_view",
        kind="sources",
        store=store,
        title=info.get("title", ""),
        sources={
            "ucp": isinstance(info.get("ucp_profile"), dict),
            "feed": info.get("product_feed") != "no encontrado",
            "sitemap": info.get("sitemap") != "no encontrado",
            "jsonld": str(info.get("structured_data", "")).startswith("sí"),
        },
    )


async def offers(ctx: RunContext, store: str, source: str, found: list[dict[str, Any]], url: str | None = None) -> None:
    await ctx.emit(
        "agent_view",
        kind="offers",
        store=store,
        source=source,
        url=url,
        offers=[_compact(o) for o in found][:12],
        readable_products=len(found),
    )


async def page(ctx: RunContext, store: str, url: str, text_chars: int, jsonld_products: int) -> None:
    await ctx.emit("agent_view", kind="page", store=store, url=url, visible_text_chars=text_chars, jsonld_products=jsonld_products)
