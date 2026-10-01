"""Automated passkey test: the phone flow in Chrome with a virtual authenticator.

  make e2e TARGET=cloud              (or APP_URL=https://… AGENT_URL=https://… to point elsewhere)

Phone-sized Chrome window, DevTools virtual authenticator (platform passkey with
user verification): enroll with the setup code → send the errand → wait for the
approval card → sign the AP2 mandate with the passkey → "Pedido confirmado".
Exits non-zero on any failure. The virtual credential is removed afterwards.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

import httpx
from playwright.async_api import async_playwright


async def main(a: argparse.Namespace) -> int:
    started = time.monotonic()
    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.launch(channel="chrome", headless=not a.headed)
        except Exception:  # noqa: BLE001
            browser = await pw.chromium.launch(headless=not a.headed)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="es-GT")
        page = await ctx.new_page()
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("WebAuthn.enable", {"enableUI": False})
        auth = await cdp.send(
            "WebAuthn.addVirtualAuthenticator",
            {"options": {"protocol": "ctap2", "transport": "internal", "hasResidentKey": True, "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}},
        )
        try:
            await page.goto(f"{a.app}/configurar?clave={a.setup}")
            await page.get_by_label("Nombre del dispositivo").fill("e2e (autenticador virtual)")
            await page.get_by_role("button", name="Registrar passkey en este dispositivo").click()
            await page.get_by_text("ya puede firmar pagos").wait_for(timeout=30000)
            print("✓ passkey registrada", flush=True)

            await page.goto(a.app)
            await page.get_by_role("button", name="Enviar encargo").click()
            await page.wait_for_url("**/encargo/**", timeout=20000)
            print("✓ encargo enviado:", page.url, flush=True)
            await page.get_by_role("heading", name="Autoriza la compra").wait_for(timeout=a.timeout * 1000)
            store = await page.locator(".row", has_text="Tienda").locator("dd").inner_text()
            total = await page.locator(".row.total dd").inner_text()
            print(f"✓ tarjeta de aprobación: {store} · {total}", flush=True)

            await page.get_by_role("button", name="Firmar mandato con passkey").click()
            await page.get_by_role("heading", name="Pedido confirmado").wait_for(timeout=60000)
            order = await page.locator(".row", has_text="Pedido").locator("dd").inner_text()
            print(f"✓ mandato firmado con passkey · pedido {order} · {time.monotonic() - started:.0f}s", flush=True)
            return 0
        except Exception as e:  # noqa: BLE001
            shot = Path(__file__).resolve().parents[1] / ".data" / "e2e-passkey-failure.png"
            shot.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(shot))
            print(f"✗ {e.__class__.__name__}: {e}", file=sys.stderr)
            return 1
        finally:
            creds = await cdp.send("WebAuthn.getCredentials", {"authenticatorId": auth["authenticatorId"]})
            async with httpx.AsyncClient(timeout=10) as http:
                for c in creds.get("credentials", []):
                    cid = c["credentialId"].replace("+", "-").replace("/", "_").rstrip("=")
                    await http.delete(f"{a.agent}/passkeys/{cid}", headers={"authorization": f"Bearer {a.setup}"})
            await browser.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--app", default="http://localhost:3000")
    p.add_argument("--agent", default="http://localhost:8000", help="to remove the virtual credential afterwards")
    p.add_argument("--setup", default="dev-admin")
    p.add_argument("--timeout", type=int, default=150)
    p.add_argument("--headed", action="store_true")
    sys.exit(asyncio.run(main(p.parse_args())))
