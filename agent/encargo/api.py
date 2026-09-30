"""Encargo agent service (FastAPI).

  POST /runs                    start an errand (errand text + store URLs, nothing else)
  GET  /runs/{id}               run state (status, checklist, decision)
  GET  /runs/{id}/events        server-sent events: every step, live
  GET  /mandates/{id}           the approval card: store-signed checkout summary
  GET  /runs/latest             the run the presenter view follows
  POST /mandates/{id}/passkey-options  WebAuthn challenge bound to the store-signed checkout
  POST /mandates/{id}/sign      HUMAN ONLY — passkey assertion → AP2 mandate → order
  POST /mandates/{id}/reject    the person says no (never moves money)
  POST /passkeys/register/*     enroll the person's phone (setup token required)
  GET  /.well-known/ucp         platform profile: the public key stores use to verify mandates
  GET  /audit?url=…             agent-readiness audit of any store
  GET  /screenshots/{id}.jpg    what a human sees (presenter view)
"""

from __future__ import annotations

import asyncio
import base64
import json
import secrets
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from . import passkey, purchase
from .ap2.signer import platform_key
from .audit import audit_store
from .config import settings
from .errand import DEFAULT_ERRAND
from .runner import start_run
from .runstore import TERMINAL_STATUSES, default_store

app = FastAPI(title="Encargo agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

UCP_VERSION = "2026-08-25"


class RunRequest(BaseModel):
    errand: str = DEFAULT_ERRAND
    stores: list[str] = Field(default_factory=lambda: settings().default_stores)


@app.get("/health")  # not /healthz: Cloud Run reserves paths ending in "z"
async def health() -> dict[str, Any]:
    s = settings()
    return {"ok": True, "mode": "mock" if s.mock_ai else "gemini", "run_store": s.run_store}


@app.post("/runs", status_code=201)
async def create_run(req: RunRequest) -> dict[str, str]:
    if len(req.stores) < 1:
        raise HTTPException(400, "Se necesita al menos una tienda.")
    run_id = await start_run(default_store(), req.errand, [s.rstrip("/") for s in req.stores])
    return {"id": run_id, "events": f"/runs/{run_id}/events"}


@app.get("/runs/latest")
async def latest_run() -> dict[str, Any]:
    run = await default_store().latest_run()
    if not run:
        raise HTTPException(404, "Todavía no hay encargos.")
    return run


@app.get("/runs/{run_id}")
async def get_run(run_id: str) -> dict[str, Any]:
    run = await default_store().get_run(run_id)
    if not run:
        raise HTTPException(404, "Encargo no encontrado.")
    return run


@app.get("/runs/{run_id}/events")
async def run_events(run_id: str, request: Request, last_event_id: str | None = Header(default=None)) -> StreamingResponse:
    store = default_store()
    if not await store.get_run(run_id):
        raise HTTPException(404, "Encargo no encontrado.")

    async def stream():
        seq = int(last_event_id or 0)
        idle = 0.0
        while not await request.is_disconnected():
            events = await store.list_events(run_id, seq)
            for e in events:
                seq = e["seq"]
                yield f"id: {seq}\nevent: {e['type']}\ndata: {json.dumps(e, ensure_ascii=False, default=str)}\n\n"
            run = await store.get_run(run_id) or {}
            if not events and run.get("status") in TERMINAL_STATUSES:
                yield "event: end\ndata: {}\n\n"
                return
            idle = 0.0 if events else idle + 0.4
            if idle >= 15:
                idle = 0.0
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.4)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"cache-control": "no-cache", "x-accel-buffering": "no"})


@app.get("/mandates/{mandate_id}")
async def get_mandate(mandate_id: str) -> dict[str, Any]:
    m = await default_store().get_mandate(mandate_id)
    if not m:
        raise HTTPException(404, "Mandato no encontrado.")
    return {**{k: v for k, v in m.items() if k not in {"checkout_mandate"}}, "checkout_hash": passkey.checkout_hash(m["checkout"])}


class SignRequest(BaseModel):
    flow_id: str | None = None
    credential: dict[str, Any] | None = None


def _test_signer(authorization: str | None) -> bool:
    """Test mode only: a bearer token stands in for the person (tests, rehearsals)."""
    s = settings()
    if s.signer_mode != "test" or not s.human_approval_token or not authorization:
        return False
    return secrets.compare_digest(authorization, f"Bearer {s.human_approval_token}")


def _require_admin(authorization: str | None) -> None:
    if not authorization or not secrets.compare_digest(authorization, f"Bearer {settings().admin_token}"):
        raise HTTPException(401, "No autorizado.")


async def _pending_mandate(mandate_id: str) -> dict[str, Any]:
    m = await default_store().get_mandate(mandate_id)
    if not m:
        raise HTTPException(404, "Mandato no encontrado.")
    if m["status"] != "pending_signature":
        raise HTTPException(409, f"El mandato ya está {m['status']}.")
    return m


@app.post("/mandates/{mandate_id}/passkey-options")
async def mandate_passkey_options(mandate_id: str) -> dict[str, Any]:
    """WebAuthn request options whose challenge is bound to this exact checkout."""
    m = await _pending_mandate(mandate_id)
    try:
        return await passkey.signing_options(default_store(), m)
    except passkey.PasskeyError as e:
        raise HTTPException(409, str(e)) from e


@app.post("/mandates/{mandate_id}/sign")
async def sign_mandate(mandate_id: str, body: SignRequest | None = None, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """HUMAN ONLY. A passkey assertion over this checkout (or, in test mode, the test token)."""
    store = default_store()
    if body and body.flow_id and body.credential:
        m = await _pending_mandate(mandate_id)
        try:
            approval = await passkey.verify_signature(store, m, body.flow_id, body.credential)
        except passkey.PasskeyError as e:
            raise HTTPException(401, str(e)) from e
        approver = f"persona (passkey {approval.get('label') or ''})".strip()
    elif _test_signer(authorization):
        approval, approver = {"method": "test"}, "persona (firmador de prueba)"
    else:
        raise HTTPException(401, "Solo la persona puede aprobar este pago: firma con tu passkey.")
    result = await purchase.sign_and_complete(store, mandate_id, approver, approval=approval)
    if not result["ok"]:
        raise HTTPException(409, result["error"])
    return result


@app.post("/mandates/{mandate_id}/reject")
async def reject_mandate(mandate_id: str) -> dict[str, Any]:
    # Saying no needs no proof: rejecting can never move money.
    result = await purchase.reject(default_store(), mandate_id)
    if not result["ok"]:
        raise HTTPException(409, result["error"])
    return result


class RegisterRequest(BaseModel):
    label: str = "Teléfono"


class RegisterVerify(BaseModel):
    flow_id: str
    credential: dict[str, Any]


@app.get("/passkeys/status")
async def passkeys_status() -> dict[str, Any]:
    s = settings()
    keys = [p for p in await default_store().list_passkeys() if p.get("rp_id") == s.passkey_rp_id]
    return {"registered": len(keys), "rp_id": s.passkey_rp_id, "labels": [p.get("label") for p in keys]}


@app.post("/passkeys/register/options")
async def passkey_register_options(req: RegisterRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization)
    return await passkey.registration_options(default_store(), req.label)


@app.post("/passkeys/register/verify")
async def passkey_register_verify(req: RegisterVerify, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization)
    try:
        return await passkey.verify_registration(default_store(), req.flow_id, req.credential)
    except passkey.PasskeyError as e:
        raise HTTPException(400, str(e)) from e


@app.delete("/passkeys/{passkey_id}")
async def passkey_delete(passkey_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization)
    await default_store().delete_passkey(passkey_id)
    return {"deleted": passkey_id}


@app.get("/.well-known/ucp")
async def platform_profile() -> dict[str, Any]:
    return {
        "ucp": {
            "version": UCP_VERSION,
            "services": {},
            "capabilities": {
                "dev.ucp.shopping.checkout": [{"version": UCP_VERSION}],
                "dev.ucp.common.payment.ap2_mandate": [{"version": UCP_VERSION, "extends": "dev.ucp.shopping.checkout"}],
            },
        },
        "keys": [platform_key().public_jwk],
    }


@app.get("/audit")
async def audit(url: str) -> dict[str, Any]:
    return await audit_store(url)


@app.get("/screenshots/{shot_id}.jpg")
async def get_screenshot(shot_id: str) -> Response:
    shot = await default_store().get_screenshot(shot_id)
    if not shot:
        raise HTTPException(404, "Captura no encontrada.")
    return Response(base64.b64decode(shot["jpeg_b64"]), media_type="image/jpeg")


@app.post("/admin/reset")
async def reset(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_admin(authorization)
    await default_store().reset()
    return {"reset": True}
