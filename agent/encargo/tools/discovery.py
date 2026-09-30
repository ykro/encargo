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
    return result
