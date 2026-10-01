"""Drives the Encargo app end to end in Chrome and screenshots every screen.

  cd agent && uv run python ../scripts/screens_app.py --app http://localhost:3000 --setup dev-admin

The phone uses Chrome's DevTools virtual authenticator (a platform passkey with
user verification), so registration and the AP2 mandate signature go through
the real WebAuthn code path. Screens are saved to docs/screenshots/app/.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from playwright.async_api import Page, async_playwright

OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots" / "app"
DESKTOP = {"width": 1920, "height": 1080}
PHONE = {"width": 390, "height": 844}


async def shot(page: Page, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    await page.wait_for_timeout(400)
    await page.screenshot(path=str(OUT / f"{name}.jpg"), type="jpeg", quality=82)
    print("saved", name, flush=True)


async def virtual_passkey(page: Page):
    cdp = await page.context.new_cdp_session(page)
    await cdp.send("WebAuthn.enable", {"enableUI": False})
    added = await cdp.send(
        "WebAuthn.addVirtualAuthenticator",
        {
            "options": {
                "protocol": "ctap2",
                "transport": "internal",
                "hasResidentKey": True,
                "hasUserVerification": True,
                "isUserVerified": True,
                "automaticPresenceSimulation": True,
            }
        },
    )
    return cdp, added["authenticatorId"]


async def main(a: argparse.Namespace) -> None:
    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.launch(channel="chrome", headless=not a.headed)
        except Exception:  # noqa: BLE001 — fall back to bundled Chromium
            browser = await pw.chromium.launch(headless=not a.headed)
        print("browser:", browser.version, flush=True)
        presenter = await (await browser.new_context(viewport=DESKTOP, locale="es-GT")).new_page()
        presenter_phone = await (await browser.new_context(viewport=PHONE, locale="es-GT", device_scale_factor=2)).new_page()
        phone_ctx = await browser.new_context(viewport=PHONE, locale="es-GT", device_scale_factor=2, is_mobile=True, has_touch=True)
        phone = await phone_ctx.new_page()
        desk_ctx = await browser.new_context(viewport=DESKTOP, locale="es-GT")
        desk = await desk_ctx.new_page()

        # Presenter before any run (empty state) — only meaningful after `make reset`.
        await presenter.goto(f"{a.app}/presenter")
        await presenter.wait_for_timeout(2500)
        await shot(presenter, "presenter-idle-1920")
        await presenter_phone.goto(f"{a.app}/presenter")
        await presenter_phone.wait_for_timeout(2500)
        await shot(presenter_phone, "presenter-idle-390")

        # Audit page (both sizes), empty and with a result.
        for page, size in ((desk, "1920"), (phone, "390")):
            await page.goto(f"{a.app}/auditoria")
            await shot(page, f"audit-empty-{size}")
            await page.get_by_role("button", name="Probar con Kilómetro").click()
            await page.locator(".score").wait_for(timeout=30000)
            await shot(page, f"audit-kilometro-{size}")
            await page.get_by_role("button", name="Probar con Pulso").click()
            await page.locator(".score").wait_for(timeout=30000)
            await page.wait_for_timeout(500)
            await shot(page, f"audit-pulso-{size}")

        # Passkey registration on the phone (virtual authenticator).
        cdp, auth_id = await virtual_passkey(phone)
        await phone.goto(f"{a.app}/configurar?clave={a.setup}")
        await shot(phone, "setup-390")
        await phone.get_by_role("button", name="Registrar passkey en este teléfono").click()
        await phone.locator(".notice-ok").wait_for(timeout=20000)
        await shot(phone, "setup-done-390")
        await desk.goto(f"{a.app}/configurar")
        await shot(desk, "setup-1920")

        # Errand on the phone.
        await phone.goto(a.app)
        await shot(phone, "errand-390")
        await desk.goto(a.app)
        await shot(desk, "errand-1920")
        await phone.get_by_role("button", name="Enviar encargo").click()
        await phone.wait_for_url("**/encargo/**", timeout=20000)
        await phone.wait_for_timeout(1200)
        await shot(phone, "loading-390")
        await presenter.wait_for_timeout(1500)
        await shot(presenter, "presenter-starting-1920")
        # Mid-run: the checklist is filling in.
        try:
            await presenter.locator(".matrix td.state.not_verifiable, .matrix td.state.met").first.wait_for(timeout=a.timeout * 1000)
            await presenter.wait_for_timeout(600)
        except Exception:  # noqa: BLE001 — a very fast run may skip straight to approval
            pass
        await shot(presenter, "presenter-running-1920")
        await shot(phone, "progress-390")

        # Approval: the card appears on the phone and on stage.
        await phone.get_by_role("heading", name="Autoriza la compra").wait_for(timeout=a.timeout * 1000)
        await shot(phone, "approve-390")
        await presenter.wait_for_timeout(1500)
        await shot(presenter, "presenter-approval-1920")
        await presenter_phone.wait_for_timeout(1000)
        await shot(presenter_phone, "presenter-approval-390")
        await desk.goto(phone.url)
        await desk.get_by_role("heading", name="Autoriza la compra").wait_for(timeout=20000)
        await shot(desk, "approve-1920")

        # Sign the AP2 mandate with the passkey.
        await phone.get_by_role("button", name="Firmar mandato con passkey").click()
        await phone.get_by_role("heading", name="Pedido confirmado").wait_for(timeout=60000)
        await shot(phone, "confirmed-390")
        await presenter.locator(".approval.done").wait_for(timeout=20000)
        await shot(presenter, "presenter-confirmed-1920")
        await desk.goto(phone.url)
        await desk.get_by_role("heading", name="Pedido confirmado").wait_for(timeout=20000)
        await shot(desk, "confirmed-1920")
        print("passkey flow OK:", phone.url, flush=True)
        # Remove the virtual credential so only real devices stay enrolled.
        import httpx

        creds = await cdp.send("WebAuthn.getCredentials", {"authenticatorId": auth_id})
        async with httpx.AsyncClient(timeout=10) as http:
            for c in creds.get("credentials", []):
                cid = c["credentialId"].replace("+", "-").replace("/", "_").rstrip("=")
                await http.delete(f"{a.agent}/passkeys/{cid}", headers={"authorization": f"Bearer {a.setup}"})
        await browser.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--app", default="http://localhost:3000")
    p.add_argument("--agent", default="http://localhost:8000", help="to remove the virtual credential afterwards")
    p.add_argument("--setup", default="dev-admin", help="setup (admin) token for passkey registration")
    p.add_argument("--timeout", type=int, default=120)
    p.add_argument("--headed", action="store_true")
    asyncio.run(main(p.parse_args()))
