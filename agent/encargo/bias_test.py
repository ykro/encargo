"""Bias test: the agent must choose by verifiable data, not by store.

  control mode OFF (Pulso opaque)      → expect Kilómetro in ≥ 9 of 10 runs
  control mode ON  (Pulso agent-ready) → expect Pulso in ≥ 9 of 10 runs (it is cheaper)

Every run goes errand → approval → passkey signature → order confirmation,
must finish in under 2 minutes, and starts from a reset store (same stock).
The agent service shuffles the store order on every run, so position cannot
explain the result; the order each run used is reported.

  uv run python -m encargo.bias_test --runs 10

Signing uses a software passkey (encargo/software_authenticator.py) enrolled with
the setup token and removed at the end — the same WebAuthn path the phone uses.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx

from .software_authenticator import SoftwareAuthenticator

RUN_LIMIT_S = 120


async def _admin(http: httpx.AsyncClient, url: str, token: str, path: str, body: dict | None = None) -> None:
    res = await http.post(f"{url}{path}", json=body or {}, headers={"authorization": f"Bearer {token}"})
    res.raise_for_status()


async def one_run(http: httpx.AsyncClient, a: argparse.Namespace, index: int) -> dict[str, Any]:
    await asyncio.gather(
        _admin(http, a.pulso, a.admin_token, "/api/admin/reset"), _admin(http, a.kilometro, a.admin_token, "/api/admin/reset")
    )
    started = time.monotonic()
    res = await http.post(f"{a.agent}/runs", json={}, headers=a.stage_headers)
    res.raise_for_status()
    run_id = res.json()["id"]
    run: dict[str, Any] = {}
    while time.monotonic() - started < RUN_LIMIT_S:
        run = (await http.get(f"{a.agent}/runs/{run_id}", headers=a.stage_headers)).json()
        if run["status"] != "running":
            break
        await asyncio.sleep(1)
    to_approval = round(time.monotonic() - started, 1)
    chosen = run.get("chosen_store")
    result: dict[str, Any] = {
        "run_id": run_id, "status": run.get("status"), "to_approval_s": to_approval, "chosen": chosen, "order_seen": run.get("stores"),
    }
    if run.get("status") == "awaiting_approval" and run.get("mandate_id"):
        mid = run["mandate_id"]
        opts = (await http.post(f"{a.agent}/mandates/{mid}/passkey-options")).json()
        credential = a.authenticator.sign(json.loads(opts["options"]))
        signed = await http.post(f"{a.agent}/mandates/{mid}/sign", json={"flow_id": opts["flow_id"], "credential": credential})
        result["order"] = signed.json().get("order", {}).get("id") if signed.status_code == 200 else None
        result["order_error"] = None if signed.status_code == 200 else signed.text[:200]
    result["total_s"] = round(time.monotonic() - started, 1)
    result["store"] = "pulso" if chosen == a.pulso else "kilometro" if chosen == a.kilometro else "ninguna"
    return result


async def main_async(a: argparse.Namespace) -> int:
    report: dict[str, Any] = {}
    a.threshold = a.threshold or -(-a.runs * 9 // 10)
    async with httpx.AsyncClient(timeout=150) as http:
        admin = {"authorization": f"Bearer {a.admin_token}"}
        stage = (await http.post(f"{a.agent}/stage/session", headers=admin)).json()
        a.stage_headers = {"authorization": f"Bearer {stage['stage_token']}"} if stage.get("stage_token") else {}
        rp_id = (await http.get(f"{a.agent}/passkeys/status")).json()["rp_id"]
        a.authenticator = SoftwareAuthenticator(a.origin, rp_id)
        opts = (await http.post(f"{a.agent}/passkeys/register/options", json={"label": "bias-test"}, headers=admin)).json()
        reg = await http.post(
            f"{a.agent}/passkeys/register/verify",
            json={"flow_id": opts["flow_id"], "credential": a.authenticator.register(json.loads(opts["options"]))},
            headers=admin,
        )
        reg.raise_for_status()
        try:
            ok = await _modes(http, a, report)
        finally:
            await http.delete(f"{a.agent}/passkeys/{a.authenticator.id}", headers=admin)
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if ok else 1


async def _modes(http: httpx.AsyncClient, a: argparse.Namespace, report: dict[str, Any]) -> bool:
    ok = True
    for mode in a.modes.split(","):
        enabled = mode == "on"
        await _admin(http, a.pulso, a.admin_token, "/api/admin/agent-ready", {"enabled": enabled})
        results = []
        for i in range(a.runs):
            r = await one_run(http, a, i)
            results.append(r)
            print(
                f"[control {mode}] run {i + 1:2d}/{a.runs}: {r['store']:9s} status={r['status']:17s} "
                f"aprobación={r['to_approval_s']:5.1f}s total={r['total_s']:5.1f}s orden={r.get('order')}",
                flush=True,
            )
        expected = "pulso" if enabled else "kilometro"
        wins = sum(r["store"] == expected for r in results)
        slow = [r for r in results if r["total_s"] >= RUN_LIMIT_S]
        completed = sum(bool(r.get("order")) for r in results)
        passed = wins >= a.threshold and not slow
        ok &= passed
        report[mode] = {
            "expected": expected,
            "wins": wins,
            "runs": a.runs,
            "completed_orders": completed,
            "max_total_s": max(r["total_s"] for r in results),
            "avg_total_s": round(sum(r["total_s"] for r in results) / len(results), 1),
            "passed": passed,
            "results": results,
        }
        print(
            f"==> control {mode}: {expected} {wins}/{a.runs} · órdenes {completed} · "
            f"promedio {report[mode]['avg_total_s']}s · máximo {report[mode]['max_total_s']}s · "
            f"{'OK' if passed else 'FALLA'}",
            flush=True,
        )
    await _admin(http, a.pulso, a.admin_token, "/api/admin/agent-ready", {"enabled": False})
    return ok


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--runs", type=int, default=10)
    p.add_argument("--threshold", type=int, default=None, help="wins needed per mode (default: 90%% of runs)")
    p.add_argument("--modes", default="off,on")
    p.add_argument("--agent", default=os.getenv("AGENT_URL", "http://localhost:8000"))
    p.add_argument("--pulso", default=os.getenv("PULSO_URL", "http://localhost:3002"))
    p.add_argument("--kilometro", default=os.getenv("KILOMETRO_URL", "http://localhost:3001"))
    p.add_argument("--admin-token", default=os.getenv("ADMIN_TOKEN", "dev-admin"))
    p.add_argument("--origin", default=os.getenv("PASSKEY_ORIGIN", "http://localhost:3000"), help="the app origin the passkey is bound to")
    p.add_argument("--out", default=None, help="Optional JSON report path")
    sys.exit(asyncio.run(main_async(p.parse_args())))


if __name__ == "__main__":
    main()
