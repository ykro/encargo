"""Encargo agent service (FastAPI).

  POST /runs                    start an errand (errand text + store URLs, nothing else)
  GET  /runs/{id}               run state (status, checklist, decision)
  GET  /runs/{id}/events        server-sent events: every step, live
  GET  /mandates/{id}           the approval card: store-signed checkout summary
  POST /mandates/{id}/sign      HUMAN ONLY — the person's approval becomes an AP2 mandate
  POST /mandates/{id}/reject    HUMAN ONLY — the person says no
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

from . import purchase
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
    return {k: v for k, v in m.items() if k not in {"checkout_mandate"}}


def _require_human(authorization: str | None) -> str:
    """Test-mode signer: a bearer token only the person's device holds.

    Phase 2 replaces this with a WebAuthn passkey assertion from the phone.
    The agent's tools never see this token, so the agent cannot approve itself.
    """
    s = settings()
    if s.signer_mode != "test" or not s.human_approval_token:
        raise HTTPException(503, "La firma de mandatos no está habilitada.")
    expected = f"Bearer {s.human_approval_token}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(401, "Solo la persona puede aprobar este pago.")
    return "persona (firmador de prueba)"


@app.post("/mandates/{mandate_id}/sign")
async def sign_mandate(mandate_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    approver = _require_human(authorization)
    result = await purchase.sign_and_complete(default_store(), mandate_id, approver)
    if not result["ok"]:
        raise HTTPException(409, result["error"])
    return result


@app.post("/mandates/{mandate_id}/reject")
async def reject_mandate(mandate_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_human(authorization)
    result = await purchase.reject(default_store(), mandate_id)
    if not result["ok"]:
        raise HTTPException(409, result["error"])
    return result


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
    if authorization != f"Bearer {settings().admin_token}":
        raise HTTPException(401, "No autorizado.")
    await default_store().reset()
    return {"reset": True}
