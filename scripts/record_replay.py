"""Records one real cloud run as a Plan B replay for the stage.

  make record-replay            (both: kilometro + pulso-control, against Cloud Run)

For each recording: reset the stores, set control mode, start the errand with
the stage token, sign the AP2 mandate with a software passkey (the same WebAuthn
path as the phone), wait for the order, then save every event, with its screenshots embedded,
to app/public/replays/<name>.json (one self-contained file per recording).
The app replays them with the original timing and no Gemini at all
(«Ver la ejecución grabada» on the presenter; the phone follows).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "agent"))
from encargo.replay_check import fingerprint  # noqa: E402
from encargo.software_authenticator import SoftwareAuthenticator  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "app" / "public" / "replays"
RECORDINGS = {"kilometro": False, "pulso-control": True}


async def events_of(http: httpx.AsyncClient, agent: str, run_id: str) -> list[dict]:
    events: list[dict] = []
    async with http.stream("GET", f"{agent}/runs/{run_id}/events", timeout=60) as res:
        async for line in res.aiter_lines():
            if line.startswith("event: end"):
                break
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    return events


async def record(http: httpx.AsyncClient, a: argparse.Namespace, name: str, control: bool, auth: SoftwareAuthenticator, stage: dict) -> None:
    admin = {"authorization": f"Bearer {a.admin_token}"}
    await asyncio.gather(*(http.post(f"{u}/api/admin/reset", headers=admin) for u in (a.pulso, a.kilometro)))
    await http.post(f"{a.pulso}/api/admin/agent-ready", json={"enabled": control}, headers=admin)
    run_id = (await http.post(f"{a.agent}/runs", json={}, headers=stage)).json()["id"]
    print(f"[{name}] run {run_id}", flush=True)
    deadline = time.monotonic() + 150
    run: dict = {}
    while time.monotonic() < deadline:
        run = (await http.get(f"{a.agent}/runs/{run_id}", headers=stage)).json()
        if run["status"] != "running":
            break
        await asyncio.sleep(1)
    if run.get("status") != "awaiting_approval":
        raise SystemExit(f"[{name}] the run ended as {run.get('status')}: {run.get('error')} — try again")
    await asyncio.sleep(a.think)  # a person reads the approval card before signing
    opts = (await http.post(f"{a.agent}/mandates/{run['mandate_id']}/passkey-options")).json()
    signed = await http.post(
        f"{a.agent}/mandates/{run['mandate_id']}/sign",
        json={"flow_id": opts["flow_id"], "credential": auth.sign(json.loads(opts["options"]))},
    )
    signed.raise_for_status()
    events = await events_of(http, a.agent, run_id)
    # Screenshots go inside the file (data URLs): the replay works with no network at all.
    import base64

    for e in events:
        if e.get("type") == "human_view":
            jpg = await http.get(f"{a.agent}/screenshots/{e['screenshot_id']}.jpg")
            e["screenshot_data"] = "data:image/jpeg;base64," + base64.b64encode(jpg.content).decode()
    (OUT / f"{name}.json").write_text(
        json.dumps(
            {"name": name, "control_mode": control, "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
             "fingerprint": fingerprint(), "run_id": run_id, "events": events},
            ensure_ascii=False,
            indent=1,
        )
    )
    types = [e["type"] for e in events]
    print(f"[{name}] {len(events)} events, {types.count('human_view')} screenshots, ends with {types[-1]}", flush=True)


async def main(a: argparse.Namespace) -> None:
    async with httpx.AsyncClient(timeout=60) as http:
        admin = {"authorization": f"Bearer {a.admin_token}"}
        stage_token = (await http.post(f"{a.agent}/stage/session", headers=admin)).json().get("stage_token")
        stage = {"authorization": f"Bearer {stage_token}"} if stage_token else {}
        rp_id = (await http.get(f"{a.agent}/passkeys/status")).json()["rp_id"]
        auth = SoftwareAuthenticator(a.origin, rp_id)
        opts = (await http.post(f"{a.agent}/passkeys/register/options", json={"label": "grabación"}, headers=admin)).json()
        (await http.post(
            f"{a.agent}/passkeys/register/verify",
            json={"flow_id": opts["flow_id"], "credential": auth.register(json.loads(opts["options"]))},
            headers=admin,
        )).raise_for_status()
        try:
            for name in a.only or RECORDINGS:
                await record(http, a, name, RECORDINGS[name], auth, stage)
        finally:
            await http.delete(f"{a.agent}/passkeys/{auth.id}", headers=admin)
            await http.post(f"{a.pulso}/api/admin/agent-ready", json={"enabled": False}, headers=admin)


if __name__ == "__main__":
    import os

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--agent", default=os.getenv("AGENT_URL", "http://localhost:8000"))
    p.add_argument("--pulso", default=os.getenv("PULSO_URL", "http://localhost:3002"))
    p.add_argument("--kilometro", default=os.getenv("KILOMETRO_URL", "http://localhost:3001"))
    p.add_argument("--origin", default=os.getenv("APP_URL", "http://localhost:3000"))
    p.add_argument("--admin-token", default=os.getenv("ADMIN_TOKEN", "dev-admin"))
    p.add_argument("--think", type=float, default=6.0, help="seconds between the approval card and the signature")
    p.add_argument("--only", action="append", choices=list(RECORDINGS))
    asyncio.run(main(p.parse_args()))
