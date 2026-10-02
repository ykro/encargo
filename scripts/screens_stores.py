"""Screenshots of every Pulso and Kilómetro screen at 1920×1080 and 390×844 (2x).

  cd agent && uv run python ../scripts/screens_stores.py --pulso URL --kilometro URL

Writes docs/screenshots/{pulso,kilometro}/<screen>-{1920,390}.jpg.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from playwright.async_api import Browser, Page, async_playwright

OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots"
SIZES = [("1920", {"width": 1920, "height": 1080}, 1), ("390", {"width": 390, "height": 844}, 2)]
def pulso_ref(slug: str) -> str:
    """Pulso's opaque product reference (FNV-1a, same as pulsoRef() in stores/shared/src/store.ts)."""
    h = 2166136261
    for c in slug:
        h = ((h ^ ord(c)) * 16777619) & 0xFFFFFFFF
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while h:
        h, r = divmod(h, 36)
        out = digits[r] + out
    return out or "0"


ERRAND_REF = pulso_ref("acatenango-t3")


async def shot(page: Page, store: str, name: str, size: str, full: bool = False) -> None:
    await page.wait_for_timeout(1800)  # Pulso's fog veil and contour lines settle
    path = OUT / store / f"{name}-{size}.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(path), type="jpeg", quality=80, full_page=full)
    print("saved", path.relative_to(OUT), flush=True)


async def new_page(browser: Browser, viewport: dict, scale: int) -> Page:
    ctx = await browser.new_context(viewport=viewport, device_scale_factor=scale, locale="es-GT", is_mobile=scale > 1, has_touch=scale > 1)
    return await ctx.new_page()


async def pulso(browser: Browser, base: str) -> None:
    for size, viewport, scale in SIZES:
        page = await new_page(browser, viewport, scale)
        await page.goto(base, wait_until="networkidle")
        await shot(page, "pulso", "home", size)
        await shot(page, "pulso", "home-full", size, full=True)
        await page.goto(f"{base}/p/{ERRAND_REF}", wait_until="networkidle")
        picker = page.locator("canvas.picker-canvas")
        await picker.focus()
        await page.keyboard.press("Home")
        for _ in range(4):  # 7, 7.5, 8, 8.5 → 9
            await page.keyboard.press("ArrowRight")
        await page.keyboard.press("Enter")
        await shot(page, "pulso", "product", size)
        await page.get_by_role("button", name="Añadir a la bolsa").click()
        await shot(page, "pulso", "product-added", size)
        await page.goto(f"{base}/bolsa", wait_until="networkidle")
        await shot(page, "pulso", "bag", size)
        await page.goto(f"{base}/checkout", wait_until="networkidle")
        await shot(page, "pulso", "checkout-signin", size)
        await page.locator("#correo").fill("persona@ejemplo.com")
        await page.locator("#clave").fill("demo-demo")
        await page.get_by_role("button", name="Entrar y continuar").click()
        await shot(page, "pulso", "checkout-delivery", size)
        empty = await new_page(browser, viewport, scale)
        await empty.goto(f"{base}/bolsa", wait_until="networkidle")
        await shot(empty, "pulso", "bag-empty", size)
        await empty.goto(f"{base}/p/zzz", wait_until="networkidle")
        await shot(empty, "pulso", "product-missing", size)


async def kilometro(browser: Browser, base: str) -> None:
    for size, viewport, scale in SIZES:
        page = await new_page(browser, viewport, scale)
        await page.goto(base, wait_until="networkidle")
        await shot(page, "kilometro", "home", size)
        await page.goto(f"{base}/trail?talla=9&max=150", wait_until="networkidle")
        await shot(page, "kilometro", "trail-filtros", size)
        empty = await new_page(browser, viewport, scale)
        await empty.goto(f"{base}/carrito", wait_until="networkidle")
        await shot(empty, "kilometro", "carrito-vacio", size)
        await page.goto(f"{base}/productos/acatenango-t3?talla=9", wait_until="networkidle")
        await shot(page, "kilometro", "producto-talla9", size)
        await page.get_by_role("button", name="Agregar al carrito").click()
        await page.wait_for_timeout(1200)
        await page.goto(f"{base}/carrito", wait_until="networkidle")
        await shot(page, "kilometro", "carrito-con-articulo", size)
        await page.goto(f"{base}/envios", wait_until="networkidle")
        await shot(page, "kilometro", "envios", size)
        await page.goto(f"{base}/no-existe", wait_until="networkidle")
        await shot(page, "kilometro", "404", size)


async def main(a: argparse.Namespace) -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome")
        await pulso(browser, a.pulso.rstrip("/"))
        await kilometro(browser, a.kilometro.rstrip("/"))
        await browser.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--pulso", required=True)
    p.add_argument("--kilometro", required=True)
    asyncio.run(main(p.parse_args()))
