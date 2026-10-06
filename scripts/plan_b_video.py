"""Plan B on the deployed app: the recorded run, started from the presenter's button.

  make plan-b-video          (also renders docs/plan-b-replay.mp4, the last-resort video)

Drives the presenter (1920×1080) and the phone (390×844) of the Cloud Run app in one
Chrome, the way the presenter does it on stage: «Ver la ejecución grabada» on the
presenter, the phone follows to the recorded approval card, and the phone signs with
a real passkey from Chrome's virtual authenticator, so the presenter may (and must)
say "firmado con passkey". Nothing here starts an errand or calls Gemini.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]


async def main(a: argparse.Namespace) -> int:
    app = a.app.rstrip("/")
    video_dir = ROOT / ".data" / "video"
    shutil.rmtree(video_dir, ignore_errors=True)
    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.launch(channel="chrome")
        except Exception:  # noqa: BLE001
            browser = await pw.chromium.launch()
        ctx = await browser.new_context(
            record_video_dir=str(video_dir) if a.video else None,
            record_video_size={"width": 1920, "height": 1080} if a.video else None,
        )
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
            "rpId": urlparse(app).hostname, "privateKey": base64.b64encode(key).decode(),
            "userHandle": base64.b64encode(b"encargo-persona").decode(), "signCount": 0}})

        await presenter.goto(f"{app}/presenter")
        await phone.goto(f"{app}/")
        await presenter.get_by_role("button", name="Ver la ejecución grabada").click(timeout=60000)
        await presenter.get_by_text("REPETICIÓN GRABADA").wait_for(timeout=20000)
        await phone.get_by_role("heading", name="Autoriza la compra").wait_for(timeout=90000)
        await presenter.get_by_text("esperando la firma en el teléfono").wait_for(timeout=60000)
        print("✓ el teléfono siguió al presentador hasta la tarjeta de aprobación grabada", flush=True)
        await phone.wait_for_timeout(1500)
        await phone.get_by_role("button", name="Firmar mandato con passkey").click()
        await phone.get_by_role("heading", name="Pedido confirmado").wait_for(timeout=30000)
        await presenter.get_by_text("Mandato AP2 firmado con passkey").wait_for(timeout=30000)
        print("✓ firmado con passkey (autenticador virtual) y pedido confirmado en los dos lados", flush=True)
        await presenter.wait_for_timeout(4000)
        await presenter.get_by_role("button", name="Volver a lo en vivo").click()
        await phone.wait_for_url(f"{app}/", timeout=10000)
        print("✓ «Volver a lo en vivo» regresa el teléfono al inicio", flush=True)
        video = await presenter.video.path() if a.video else None
        await ctx.close()
        await browser.close()
    if video:
        mp4 = ROOT / "docs" / "plan-b-replay.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-crf", "28", "-preset", "slow", "-movflags", "+faststart", str(mp4)], check=True)
        print(f"✓ video: {mp4.relative_to(ROOT)} ({mp4.stat().st_size // 1024} KB)", flush=True)
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--app", default=os.getenv("APP_URL", ""), required=not os.getenv("APP_URL"))
    p.add_argument("--video", action="store_true")
    sys.exit(asyncio.run(main(p.parse_args())))
