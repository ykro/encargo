"""Plan B test with the network cut: the replay must work with no internet.

  make e2e-offline           (VIDEO=1 also renders docs/plan-b-replay.mp4)

Starts the app exactly like `make up-offline` (agent and stores pointed at an
unreachable address) and drives presenter + phone in one Chrome. Every request
to a host other than localhost is blocked and counted: the test fails if the
replay needed any. The phone signs with a real passkey from Chrome's virtual
authenticator, so the presenter may (and must) say "firmado con passkey".
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = 3100
APP = f"http://localhost:{PORT}"


def start_server() -> subprocess.Popen:
    env = {**os.environ, "PORT": str(PORT)}
    proc = subprocess.Popen([str(ROOT / "scripts" / "up-offline.sh")], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
    deadline = time.time() + 300
    while time.time() < deadline:
        try:
            if httpx.get(f"{APP}/replays/kilometro.json", timeout=2).status_code == 200:
                return proc
        except httpx.HTTPError:
            time.sleep(1)
    os.killpg(proc.pid, signal.SIGTERM)
    raise SystemExit("La app sin internet no arrancó.")


async def main(a: argparse.Namespace) -> int:
    proc = start_server()
    outside: list[str] = []
    video_dir = ROOT / ".data" / "video"
    shutil.rmtree(video_dir, ignore_errors=True)
    try:
        async with async_playwright() as pw:
            try:
                browser = await pw.chromium.launch(channel="chrome")
            except Exception:  # noqa: BLE001
                browser = await pw.chromium.launch()
            ctx = await browser.new_context(
                record_video_dir=str(video_dir) if a.video else None,
                record_video_size={"width": 1920, "height": 1080} if a.video else None,
            )

            async def guard(route):
                host = urlparse(route.request.url).hostname or ""
                if host in {"localhost", "127.0.0.1"}:
                    await route.continue_()
                else:  # "no internet": anything else fails, and the test notices
                    outside.append(route.request.url)
                    await route.abort("internetdisconnected")

            await ctx.route("**/*", guard)
            presenter = await ctx.new_page()
            await presenter.set_viewport_size({"width": 1920, "height": 1080})
            phone = await ctx.new_page()
            await phone.set_viewport_size({"width": 390, "height": 844})

            # A real passkey for this origin, held by Chrome's virtual authenticator.
            cdp = await ctx.new_cdp_session(phone)
            await cdp.send("WebAuthn.enable", {"enableUI": False})
            auth = await cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {
                "protocol": "ctap2", "transport": "internal", "hasResidentKey": True,
                "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}})
            key = ec.generate_private_key(ec.SECP256R1()).private_bytes(
                serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
            await cdp.send("WebAuthn.addCredential", {"authenticatorId": auth["authenticatorId"], "credential": {
                "credentialId": base64.b64encode(os.urandom(16)).decode(), "isResidentCredential": True,
                "rpId": "localhost", "privateKey": base64.b64encode(key).decode(),
                "userHandle": base64.b64encode(b"encargo-persona").decode(), "signCount": 0}})

            await presenter.goto(f"{APP}/presenter?demo=1")
            await presenter.get_by_text("REPETICIÓN GRABADA").wait_for(timeout=20000)
            await phone.goto(f"{APP}/?demo=1")
            await phone.get_by_role("button", name="Enviar encargo").click()
            started = time.monotonic()
            await phone.get_by_role("heading", name="Autoriza la compra").wait_for(timeout=90000)
            await presenter.get_by_text("esperando una firma real").wait_for(timeout=30000)
            print(f"✓ tarjeta de aprobación sin internet ({time.monotonic() - started:.0f}s); el presentador espera la firma", flush=True)
            await phone.wait_for_timeout(1500)
            await phone.get_by_role("button", name="Firmar mandato con passkey").click()
            await phone.get_by_role("heading", name="Pedido confirmado").wait_for(timeout=30000)
            await presenter.get_by_text("Mandato AP2 firmado con passkey").wait_for(timeout=30000)
            print("✓ firmado con passkey (autenticador virtual) y pedido confirmado en los dos lados", flush=True)
            await presenter.wait_for_timeout(4000)
            await presenter.screenshot(path=str(ROOT / ".data" / "presenter-offline-1920.jpg"), type="jpeg", quality=80)  # local evidence, not in git
            video = await presenter.video.path() if a.video else None
            await ctx.close()
            await browser.close()
        if outside:
            print(f"✗ la repetición pidió {len(outside)} recurso(s) fuera del portátil: {outside[:3]}", file=sys.stderr)
            return 1
        print("✓ ninguna petición salió del portátil", flush=True)
        if video:
            mp4 = ROOT / "docs" / "plan-b-replay.mp4"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                            "-crf", "28", "-preset", "slow", "-movflags", "+faststart", str(mp4)], check=True)
            print(f"✓ video: {mp4.relative_to(ROOT)} ({mp4.stat().st_size // 1024} KB)", flush=True)
        return 0
    finally:
        os.killpg(proc.pid, signal.SIGTERM)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--video", action="store_true")
    sys.exit(asyncio.run(main(p.parse_args())))
