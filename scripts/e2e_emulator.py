"""The phone side on the Android emulator: Chrome driven over adb + DevTools.

  make e2e-emulator                  (Cloud Run by default; TARGET=local uses adb reverse; ANDROID_SERIAL=emulator-5556)

Checks what the emulator can do without a Google account: open the app, send
the errand, follow the run and show the approval card. It also records what
happens when a passkey is requested: with no credential provider on the device
Chrome only offers "another device" (hybrid QR), so the signature happens on the
laptop (see README, "Quién firma"). Screenshots go to docs/screenshots/emulator/.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
from pathlib import Path

from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots" / "emulator"
PORT = 9333


def adb(serial: str, *args: str) -> bytes:
    return subprocess.run(["adb", "-s", serial, *args], check=True, capture_output=True).stdout


async def shot(page, name: str, serial: str = os.getenv("ANDROID_SERIAL", "emulator-5556")) -> None:
    # Screenshot of *our* tab via DevTools: the emulator may be shared, so the
    # device screen (adb screencap) can show another app in the foreground.
    OUT.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        adb(serial, "shell", "am", "start", "-n", "com.android.chrome/com.google.android.apps.chrome.Main")
        await page.bring_to_front()
        try:
            await page.screenshot(path=str(OUT / f"{name}.png"), timeout=8000)
            break
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
    print("saved", name, flush=True)


def screencap(serial: str, name: str) -> None:
    """Device screen, only for native UI (the passkey sheet), which the tab cannot capture."""
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.png").write_bytes(adb(serial, "exec-out", "screencap", "-p"))
    print("saved", name, "(device screen)", flush=True)


async def foreground(serial: str, page) -> None:
    """The emulator is shared: put Chrome and our tab back in front (background tabs pause)."""
    adb(serial, "shell", "am", "start", "-n", "com.android.chrome/com.google.android.apps.chrome.Main")
    await page.bring_to_front()


async def wait_for(serial: str, page, locator, timeout_s: int) -> None:
    deadline = asyncio.get_event_loop().time() + timeout_s
    while True:
        await foreground(serial, page)
        try:
            await locator.wait_for(timeout=5000)
            return
        except Exception:  # noqa: BLE001
            if asyncio.get_event_loop().time() > deadline:
                raise


async def main(a: argparse.Namespace) -> int:
    serial = a.serial
    adb(serial, "shell", "am", "start", "-n", "com.android.chrome/com.google.android.apps.chrome.Main")
    await asyncio.sleep(2)
    adb(serial, "forward", f"tcp:{PORT}", "localabstract:chrome_devtools_remote")
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(f"http://localhost:{PORT}")
        page = await browser.contexts[0].new_page()  # our own tab, never someone else's
        await page.bring_to_front()
        # Enroll this browser for the stage (same setup link as the signing device).
        await page.goto(f"{a.app}/configurar?clave={a.setup}")
        await wait_for(serial, page, page.get_by_text("Este dispositivo puede enviar encargos"), 30)
        await page.goto(a.app)
        await wait_for(serial, page, page.get_by_role("heading", name="¿Qué necesitas?"), 30)
        await shot(page, "errand")
        await page.get_by_role("button", name="Enviar encargo").click()
        await page.wait_for_url("**/encargo/**", timeout=20000)
        print("✓ encargo enviado desde el emulador:", page.url, flush=True)
        await page.wait_for_timeout(4000)
        await shot(page, "progress")
        await wait_for(serial, page, page.get_by_role("heading", name="Autoriza la compra"), a.timeout)
        print("✓ tarjeta de aprobación en el emulador", flush=True)
        await shot(page, "approve")
        sign = page.get_by_role("button", name="Firmar mandato con passkey")
        print("  botón Firmar", "habilitado" if await sign.is_enabled() else "deshabilitado (no hay passkey registrada)", flush=True)
        # Leave nothing pending: cancel from the phone; nothing is paid.
        cancel = page.get_by_role("button", name="Cancelar")
        await cancel.scroll_into_view_if_needed()
        await page.wait_for_timeout(600)  # let the approval card settle (slide-in)
        await cancel.click()
        try:
            await wait_for(serial, page, page.get_by_role("heading", name="Compra cancelada"), 20)
        except Exception:  # noqa: BLE001 — a backgrounded tab may miss the live event; the reload replays it
            await page.reload()
            await wait_for(serial, page, page.get_by_role("heading", name="Compra cancelada"), 30)
        await shot(page, "cancelled")
        if a.try_passkey:
            # What Chrome offers when this device is asked to create a passkey.
            await page.goto(f"{a.app}/configurar?clave={a.setup}")
            await foreground(serial, page)
            await page.get_by_role("button", name="Registrar passkey en este dispositivo").click()
            await page.wait_for_timeout(3500)
            screencap(serial, "passkey-sheet")
            adb(serial, "shell", "input", "keyevent", "KEYCODE_BACK")
            await page.wait_for_timeout(1500)
            await shot(page, "passkey-cancelled")
        print("✓ cancelado desde el emulador (sin cobro)", flush=True)
        await page.close()
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--app", required=True)
    p.add_argument("--serial", default=os.getenv("ANDROID_SERIAL", "emulator-5556"))
    p.add_argument("--timeout", type=int, default=150)
    p.add_argument("--setup", default=os.getenv("ADMIN_TOKEN", ""), help="setup code, to record the passkey sheet")
    p.add_argument("--try-passkey", action="store_true", help="also record what Chrome shows when a passkey is requested")
    sys.exit(asyncio.run(main(p.parse_args())))
