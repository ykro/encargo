"""inspect_store: what does this store publish for machines? The agent never
starts from the homepage — it starts from the well-known places."""

from __future__ import annotations

from typing import Any

import httpx

from ..run_context import RunContext


async def _get(http: httpx.AsyncClient, url: str) -> httpx.Response | None:
    try:
        return await http.get(url, follow_redirects=True)
    except httpx.HTTPError:
        return None


async def load_ucp_profile(ctx: RunContext, store: str) -> dict[str, Any] | None:
    if store in ctx.profiles:
        return ctx.profiles[store]
    res = await _get(ctx.http, f"{store}/.well-known/ucp")
    if res is None or res.status_code != 200:
        return None
    try:
        profile = res.json()
    except ValueError:
        return None
    ctx.profiles[store] = profile
    return profile


def rest_endpoint(profile: dict[str, Any]) -> str | None:
    for service in (profile.get("ucp", {}).get("services", {}) or {}).get("dev.ucp.shopping", []):
        if service.get("transport") == "rest":
            return service.get("endpoint")
    return None


async def _sample_structured_data(ctx: RunContext, store: str, sitemap: httpx.Response | None, home: httpx.Response | None) -> str:
    """Looks at one product page (from the sitemap or the homepage links) for schema.org JSON-LD."""
    from urllib.parse import urlparse

    from .structured_data import parse_html

    candidates: list[str] = []
    if sitemap is not None and sitemap.status_code == 200:
        candidates = [u.split("</loc>")[0] for u in sitemap.text.split("<loc>")[1:]]
    elif home is not None and home.status_code == 200:
        host = urlparse(store).netloc
        candidates = [u for u in parse_html(home.text, store)["links"] if urlparse(u).netloc == host and u.rstrip("/") != store]
    for url in candidates[:1]:
        page = await _get(ctx.http, url)
        if page is not None and page.status_code == 200:
            blocks = parse_html(page.text, url)["jsonld"]
            products = [b for b in blocks if isinstance(b, dict) and b.get("@type") in {"Product", "ProductGroup"}]
            if products:
                return f"sí: {len(products)} producto(s) en JSON-LD en {url}"
    return "no encontrado"


async def inspect_store(ctx: RunContext, store_url: str) -> dict[str, Any]:
    store = ctx.store_url(store_url)
    profile = await load_ucp_profile(ctx, store)
    robots = await _get(ctx.http, f"{store}/robots.txt")
    feed = await _get(ctx.http, f"{store}/feed.xml")
    sitemap = await _get(ctx.http, f"{store}/sitemap.xml")
    home = await _get(ctx.http, store)
    title = ""
    if home is not None and "<title>" in home.text:
        title = home.text.split("<title>", 1)[1].split("</title>", 1)[0]
    result: dict[str, Any] = {
        "store": store,
        "title": title,
        "robots_txt": robots.text.strip()[:300] if robots is not None and robots.status_code == 200 else "no encontrado",
        "product_feed": f"{store}/feed.xml" if feed is not None and feed.status_code == 200 else "no encontrado",
        "sitemap": f"{store}/sitemap.xml" if sitemap is not None and sitemap.status_code == 200 else "no encontrado",
    }
    result["structured_data"] = await _sample_structured_data(ctx, store, sitemap, home)
    if profile:
        caps = sorted((profile.get("ucp", {}).get("capabilities") or {}).keys())
        result["ucp_profile"] = {
            "version": profile.get("ucp", {}).get("version"),
            "rest_endpoint": rest_endpoint(profile),
            "capabilities": caps,
            "payment_handlers": sorted((profile.get("ucp", {}).get("payment_handlers") or {}).keys()),
            "signing_keys": len(profile.get("keys") or []),
        }
    else:
        result["ucp_profile"] = "no encontrado (/.well-known/ucp)"
    from . import agent_view

    await agent_view.sources(ctx, store, result)
    return result
