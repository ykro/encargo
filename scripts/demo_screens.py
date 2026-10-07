"""The whole demo, end to end, the way the presenter does it, with docs/demo/NN-*.png.

  make demo-screens          (against Cloud Run, best from a cold start; leaves the cloud reset)

Presenter at 1920×1080 and the phone window at 390×844 in one Chrome, like on stage,
and only clicks: open the presenter (it wakes everything), enable the phone with the
passkey, send the errand, sign, turn control mode on from the presenter, repeat, audit,
the recorded run from the presenter's button, «Empezar de nuevo». No command in between.

The phone signs with Chrome's DevTools virtual authenticator: same app screens and the
same WebAuthn path as Touch ID, minus the macOS system dialog (which automation cannot
show). Registering that test passkey is the one step that uses the setup code; it is
removed at the end.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from pathlib import Path

import httpx
from playwright.async_api import Page, async_playwright

OUT = Path(__file__).resolve().parents[1] / "docs" / "demo"
ERRAND = "Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes"


async def shot(page: Page, name: str, wait: int = 600) -> None:
    await page.wait_for_timeout(wait)
    OUT.mkdir(parents=True, exist_ok=True)
    # The phone keeps its 2× pixels; the presenter is saved at its 1920×1080 CSS size.
    scale = "device" if (page.viewport_size or {}).get("width", 0) < 800 else "css"
    await page.screenshot(path=str(OUT / f"{name}.png"), scale=scale)
    print("saved", name, flush=True)


async def run_errand(phone: Page, presenter: Page, a: argparse.Namespace, prefix: str, first: bool) -> None:
    await phone.goto(a.app)
    box = phone.locator("#errand")
    await box.fill("")
    await box.type(ERRAND, delay=15)
    if first:
        await shot(phone, "02-telefono-encargo")
    await phone.get_by_role("button", name="Enviar encargo").click()
    try:
        await phone.wait_for_url("**/encargo/**", timeout=30000)
    except Exception:
        notice = await phone.locator(".notice").all_inner_texts()
        await phone.screenshot(path=str(OUT.parent.parent / ".data" / "demo-screens-failure.png"))
        raise SystemExit(f"El encargo no se envió: {notice}")
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
        browser = await pw.chromium.launch(channel="chrome", headless=True)
        # One Chrome profile for both windows, as on stage: the phone's enablement applies to the presenter.
        ctx = await browser.new_context(locale="es-GT", device_scale_factor=2)
        presenter = await ctx.new_page()
        await presenter.set_viewport_size({"width": 1920, "height": 1080})
        phone = await ctx.new_page()
        await phone.set_viewport_size({"width": 390, "height": 844})
        cdp = await ctx.new_cdp_session(phone)
        await cdp.send("WebAuthn.enable", {"enableUI": False})
        auth = await cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {
            "protocol": "ctap2", "transport": "internal", "hasResidentKey": True,
            "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}})
        try:
            # The test passkey (on stage it already exists: Touch ID on the presenter's laptop).
            await phone.goto(f"{a.app}/configurar?clave={a.admin_token}")
            await phone.get_by_label("Nombre del dispositivo").fill("captura (autenticador virtual)")
            await phone.get_by_role("button", name="Registrar passkey en este dispositivo").click()
            await phone.get_by_text("ya puede firmar pagos").wait_for(timeout=60000)
            await phone.evaluate("localStorage.clear()")  # from here on, a browser nobody configured

            # 1. Open the presenter: it wakes the stores, the agent, Gemini and Chromium by itself.
            t = time.monotonic()
            await presenter.goto(f"{a.app}/presentador")
            if await presenter.get_by_text("Preparando la demo").or_(presenter.get_by_text("Despertando el agente")).is_visible():
                await shot(presenter, "00-presentador-preparando", 300)
            await presenter.get_by_text("Envía un encargo desde la app").wait_for(timeout=180000)
            print(f"presenter ready after {time.monotonic() - t:.0f} s", flush=True)
            await shot(presenter, "01-presentador-listo", 800)

            # 2. The phone: enable this browser with the passkey (Touch ID on stage), then the errand.
            await phone.goto(a.app)
            await phone.get_by_role("button", name="Habilitar con Touch ID").wait_for(timeout=30000)
            await shot(phone, "01b-telefono-habilitar")
            await phone.get_by_role("button", name="Habilitar con Touch ID").click()
            try:
                await phone.locator(".enable-card").wait_for(state="detached", timeout=30000)
            except Exception:
                raise SystemExit(f"No se habilitó el navegador: {await phone.locator('.notice').all_inner_texts()}")

            await run_errand(phone, presenter, a, "05", first=True)
            await shot(phone, "07-telefono-confirmado")
            await shot(presenter, "08-presentador-pedido-confirmado", 1500)

            # 3. Control mode, from the presenter's switch: the same errand now buys at Pulso.
            await presenter.get_by_role("button", name="Modo de control").click()
            await presenter.locator(".p-control strong", has_text="ENCENDIDO").wait_for(timeout=30000)
            await run_errand(phone, presenter, a, "09", first=False)
            await shot(presenter, "10-presentador-control-pulso", 1500)

            # 4. The audit: QR for the audience, then the two stores side by side.
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
            await audit.close()

            # 5. «Empezar de nuevo»: stock back, no errand on screen, control mode off.
            await presenter.bring_to_front()
            await presenter.get_by_role("button", name="Empezar de nuevo").click()
            await presenter.locator(".p-control strong", has_text="APAGADO").wait_for(timeout=30000)
            await presenter.get_by_text("Esperando un encargo").wait_for(timeout=30000)
            print("✓ «Empezar de nuevo»: modo de control apagado y sin encargo en pantalla", flush=True)

            # 6. Plan B from the presenter's button; the phone follows to the recorded approval.
            await phone.goto(a.app)
            await presenter.get_by_role("button", name="Ver la ejecución grabada").click()
            await presenter.get_by_text("esperando la firma en el teléfono").wait_for(timeout=90000)
            await shot(presenter, "14-plan-b-repeticion", 800)
            await phone.get_by_role("heading", name="Autoriza la compra").wait_for(timeout=30000)
            await phone.get_by_role("button", name="Firmar mandato con passkey").click()
            await presenter.get_by_text("Mandato AP2 firmado con passkey").wait_for(timeout=60000)
            await presenter.get_by_role("button", name="Volver a lo en vivo").click()
            await phone.wait_for_url(f"{a.app.rstrip('/')}/", timeout=15000)
            print("✓ plan B: el teléfono siguió, se firmó y volvió a lo en vivo", flush=True)
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
