"""Captures docs/demo/NN-*.png: the talk, screen by screen, from a real Cloud Run run.

  make demo-screens          (needs `make stage-on`; leaves the cloud reset)

Presenter at 1920×1080 and the phone window at 390×844 in one Chrome, like on
stage. The phone signs with Chrome's DevTools virtual authenticator: same app
screens and same WebAuthn path as Touch ID, minus the macOS system dialog
(which automation cannot show). That credential is removed at the end.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

import httpx
from playwright.async_api import Page, async_playwright

OUT = Path(__file__).resolve().parents[1] / "docs" / "demo"
ERRAND = "Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes"


async def shot(page: Page, name: str, wait: int = 600) -> None:
    await page.wait_for_timeout(wait)
    OUT.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(OUT / f"{name}.png"))
    print("saved", name, flush=True)


async def run_errand(phone: Page, presenter: Page, a: argparse.Namespace, prefix: str, first: bool) -> None:
    await phone.goto(a.app)
    box = phone.locator("#errand")
    await box.fill("")
    await box.type(ERRAND, delay=15)
    if first:
        await shot(phone, "02-telefono-encargo")
    await phone.get_by_role("button", name="Enviar encargo").click()
    await phone.wait_for_url("**/encargo/**", timeout=20000)
    if first:
        await presenter.locator(".matrix td.state.not_verifiable, .matrix td.state.met").first.wait_for(timeout=a.timeout * 1000)
        await shot(presenter, "03-presentador-razonamiento", 1500)
        await shot(phone, "04-telefono-revisando")
    await phone.get_by_role("heading", name="Autoriza la compra").wait_for(timeout=a.timeout * 1000)
    await presenter.locator(".approval.waiting").wait_for(timeout=30000)
    await shot(presenter, f"{prefix}-presentador-esperando-firma", 1200)
    if first:
        await shot(phone, "06-telefono-autoriza")
    await phone.get_by_role("button", name="Firmar mandato con passkey").click()
    await phone.get_by_role("heading", name="Pedido confirmado").wait_for(timeout=60000)
    await presenter.locator(".approval.done").wait_for(timeout=30000)


async def main(a: argparse.Namespace) -> None:
    admin = {"authorization": f"Bearer {a.admin_token}"}
    async with httpx.AsyncClient(timeout=30) as http, async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome")
        ctx = await browser.new_context(locale="es-GT")
        presenter = await ctx.new_page()
        await presenter.set_viewport_size({"width": 1920, "height": 1080})
        phone_ctx = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="es-GT")
        phone = await phone_ctx.new_page()
        cdp = await phone_ctx.new_cdp_session(phone)
        await cdp.send("WebAuthn.enable", {"enableUI": False})
        auth = await cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {
            "protocol": "ctap2", "transport": "internal", "hasResidentKey": True,
            "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}})
        try:
            await presenter.goto(f"{a.app}/presenter")
            await presenter.get_by_text("Esperando un encargo").wait_for(timeout=30000)
            await shot(presenter, "01-presentador-listo", 1500)

            # The phone window: enrolled once with the setup link (stage token + passkey).
            await phone.goto(f"{a.app}/configurar?clave={a.admin_token}")
            await phone.get_by_label("Nombre del dispositivo").fill("captura (autenticador virtual)")
            await phone.get_by_role("button", name="Registrar passkey en este dispositivo").click()
            await phone.get_by_text("ya puede firmar pagos").wait_for(timeout=30000)

            await run_errand(phone, presenter, a, "05", first=True)
            await shot(phone, "07-telefono-confirmado")
            await shot(presenter, "08-presentador-pedido-confirmado", 1500)

            # Control mode: Pulso publishes the same data; the same errand now buys at Pulso.
            await http.post(f"{a.pulso}/api/admin/agent-ready", json={"enabled": True}, headers=admin)
            await presenter.get_by_text("ENCENDIDO").wait_for(timeout=20000)
            await run_errand(phone, presenter, a, "09", first=False)
            await shot(presenter, "10-presentador-control-pulso", 1500)
            await http.post(f"{a.pulso}/api/admin/agent-ready", json={"enabled": False}, headers=admin)

            # The audit: QR for the audience, then the two stores side by side.
            audit = await ctx.new_page()
            await audit.set_viewport_size({"width": 1920, "height": 1080})
            await audit.goto(f"{a.app}/auditoria")
            await shot(audit, "11-auditoria-qr", 1000)
            await audit.get_by_role("button", name="Probar con Pulso").click()
            await audit.locator(".score").wait_for(timeout=60000)
            await shot(audit, "12-auditoria-pulso", 800)
            await audit.get_by_role("button", name="Probar con Kilómetro").click()
            await audit.locator(".audit-grid li.ok").first.wait_for(timeout=60000)
            await shot(audit, "13-auditoria-kilometro", 800)

            # Plan B: R on the presenter (control mode back off, so it plays the main recording).
            await presenter.bring_to_front()
            await presenter.locator(".p-control strong", has_text="APAGADO").wait_for(timeout=20000)
            await presenter.keyboard.press("r")
            await presenter.get_by_text("esperando una firma real").wait_for(timeout=90000)
            await shot(presenter, "14-plan-b-repeticion", 800)
        finally:
            creds = await cdp.send("WebAuthn.getCredentials", {"authenticatorId": auth["authenticatorId"]})
            for c in creds.get("credentials", []):
                cid = c["credentialId"].replace("+", "-").replace("/", "_").rstrip("=")
                await http.delete(f"{a.agent}/passkeys/{cid}", headers=admin)
            await http.post(f"{a.pulso}/api/admin/agent-ready", json={"enabled": False}, headers=admin)
            await browser.close()


if __name__ == "__main__":
    import os

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--app", default=os.getenv("APP_URL", "http://localhost:3000"))
    p.add_argument("--agent", default=os.getenv("AGENT_URL", "http://localhost:8000"))
    p.add_argument("--pulso", default=os.getenv("PULSO_URL", "http://localhost:3002"))
    p.add_argument("--admin-token", default=os.getenv("ADMIN_TOKEN", "dev-admin"))
    p.add_argument("--timeout", type=int, default=150)
    asyncio.run(main(p.parse_args()))
