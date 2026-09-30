"""browse_page: open a page in headless Chromium, like a person would.

The screenshot goes to the presenter view ("what a human sees"). The agent
itself gets only what the rendered page states as data or text: pixels are not
evidence. A price painted inside a banner can be misread and cannot be checked
against the store's own records, so it never counts toward a condition.
"""

from __future__ import annotations

import asyncio
import base64
import secrets
from typing import Any

from ..run_context import RunContext
from .structured_data import MAX_TEXT, offers_from_jsonld

_browser_lock = asyncio.Lock()
_playwright: Any = None
_browser: Any = None


async def _get_browser() -> Any:
    global _playwright, _browser
    async with _browser_lock:
        if _browser is None or not _browser.is_connected():
            from playwright.async_api import async_playwright

            _playwright = await async_playwright().start()
            _browser = await _playwright.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        return _browser


async def close_browser() -> None:
    global _playwright, _browser
    if _browser is not None:
        await _browser.close()
    if _playwright is not None:
        await _playwright.stop()
    _browser = _playwright = None


RENDERED = """() => ({
  title: document.title,
  text: document.body ? document.body.innerText : "",
  jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
  links: [...document.querySelectorAll('a[href]')].map(a => a.href),
  images: [...document.images].map(i => ({alt: i.alt, src: i.currentSrc || i.src})),
  canvases: document.querySelectorAll('canvas').length,
})"""


async def screenshot(ctx: RunContext, url: str, purpose: str) -> dict[str, Any]:
    """Renders the page, stores a JPEG for the presenter view and returns what the DOM says."""
    import json

    browser = await _get_browser()
    context = await browser.new_context(viewport={"width": 1280, "height": 800}, locale="es-GT")
    try:
        page = await context.new_page()
        await page.goto(url, wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(300)
        shot = await page.screenshot(type="jpeg", quality=55)
        rendered = await page.evaluate(RENDERED)
    finally:
        await context.close()
    shot_id = f"shot_{secrets.token_hex(6)}"
    await ctx.store.save_screenshot(shot_id, {"run_id": ctx.run_id, "url": url, "jpeg_b64": base64.b64encode(shot).decode()})
    await ctx.emit("human_view", store=ctx.store_url(url), url=url, screenshot_id=shot_id, purpose=purpose)
    blocks = []
    for raw in rendered["jsonld"]:
        try:
            blocks.append(json.loads(raw))
        except (TypeError, ValueError):
            continue
    return {"rendered": rendered, "jsonld": blocks, "screenshot_id": shot_id}


async def browse_page(ctx: RunContext, url: str) -> dict[str, Any]:
    store = ctx.store_url(url)
    try:
        r = await screenshot(ctx, url, "agent")
    except Exception as e:  # noqa: BLE001 — a failed browse is an observation, not a crash
        return {"url": url, "error": f"No se pudo abrir la página: {e.__class__.__name__}"}
    rendered = r["rendered"]
    offers = offers_from_jsonld(r["jsonld"], ctx)
    text = " ".join(rendered["text"].split())[:MAX_TEXT]
    images = rendered["images"]
    from . import agent_view

    if offers:
        await agent_view.offers(ctx, store, "schema.org JSON-LD (navegador)", offers, url)
    await agent_view.page(ctx, store, url, len(rendered["text"].strip()), len(offers))
    return {
        "url": url,
        "title": rendered["title"],
        "structured_data": offers or "ninguno (no hay JSON-LD de producto)",
        "visible_text": text or "(sin texto visible)",
        "links": sorted({link for link in rendered["links"] if link.startswith(store)})[:25],
        "images": {
            "count": len(images),
            "with_descriptive_alt": sum(1 for i in images if len((i.get("alt") or "").strip()) > 3),
        },
        "custom_widgets": f"{rendered['canvases']} canvas (contenido dibujado, sin datos en el DOM)" if rendered["canvases"] else "ninguno",
        "note": "La captura de pantalla es para la persona. El texto dentro de imágenes no es un dato verificable.",
    }
