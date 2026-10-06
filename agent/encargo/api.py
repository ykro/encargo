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
  GET  /stage/status, POST /stage/warmup   talk-day readiness, called by the presenter page
  POST /stage/reset, /stage/control        «Empezar de nuevo» and the control-mode switch (enrolled device)
  POST /stage/session/passkey*             enable a browser with the registered passkey
"""

from __future__ import annotations

import asyncio
import base64
import json
import random
import secrets
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from . import passkey, purchase, stage
from .ap2.signer import platform_key
from urllib.parse import urlparse

from .audit import UnsafeURL, audit_store
from .config import settings
from .errand import DEFAULT_ERRAND
from .runner import start_run
from .runstore import TERMINAL_STATUSES, default_store

app = FastAPI(title="Encargo agent")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

UCP_VERSION = "2026-08-25"


class RunRequest(BaseModel):
    # Only the errand comes from the client. The stores are fixed on the server
    # (STORE_URLS): nobody can point the agent at another site during the talk.
    errand: str = Field(default=DEFAULT_ERRAND, max_length=300)


@app.get("/health")  # not /healthz: Cloud Run reserves paths ending in "z"
async def health() -> dict[str, Any]:
    s = settings()
    return {"ok": True, "mode": "mock" if s.mock_ai else "gemini", "run_store": s.run_store}


def _bearer_ok(authorization: str | None, token: str) -> bool:
    return bool(token) and bool(authorization) and secrets.compare_digest(authorization, f"Bearer {token}")


def _require_stage(authorization: str | None) -> None:
    """Starting an errand or rejecting a payment needs an enrolled device (passkey mode)."""
    s = settings()
    if not s.stage_required:
        return
    if not s.stage_token:
        raise HTTPException(503, "El acceso de escenario no está configurado (STAGE_TOKEN).")
    if not _bearer_ok(authorization, s.stage_token):
        raise HTTPException(401, "Este dispositivo no está habilitado. Ábrelo desde el enlace de configuración.")


def _is_stage(authorization: str | None) -> bool:
    s = settings()
    return not s.stage_required or _bearer_ok(authorization, s.stage_token)


def _public_run(run: dict[str, Any], authorization: str | None) -> dict[str, Any]:
    # Anonymous viewers (the presenter) never get the mandate id.
    return run if _is_stage(authorization) else {k: v for k, v in run.items() if k != "mandate_id"}


@app.post("/runs", status_code=201)
async def create_run(req: RunRequest, authorization: str | None = Header(default=None)) -> dict[str, str]:
    _require_stage(authorization)
    stores = [s.rstrip("/") for s in settings().default_stores]
    # Shuffled per run, so list position can never be what decides.
    random.shuffle(stores)
    if not stores:
        raise HTTPException(503, "No hay tiendas configuradas (STORE_URLS).")
    run_id = await start_run(default_store(), req.errand, stores)
    return {"id": run_id, "events": f"/runs/{run_id}/events"}


@app.post("/stage/session")
async def stage_session(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """The setup link (/configurar?clave=…) trades the setup code for the stage token."""
    _require_admin(authorization)
    s = settings()
    if s.stage_required and not s.stage_token:
        raise HTTPException(503, "El acceso de escenario no está configurado (STAGE_TOKEN).")
    return {"stage_token": s.stage_token, "required": s.stage_required}


@app.get("/runs/latest")
async def latest_run(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    run = await default_store().latest_run()
    if not run:
        raise HTTPException(404, "Todavía no hay encargos.")
    return _public_run(run, authorization)


@app.get("/runs/{run_id}")
async def get_run(run_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    run = await default_store().get_run(run_id)
    if not run:
        raise HTTPException(404, "Encargo no encontrado.")
    return _public_run(run, authorization)


@app.get("/runs/{run_id}/events")
async def run_events(run_id: str, request: Request, last_event_id: str | None = Header(default=None)) -> StreamingResponse:
    store = default_store()
    if not await store.get_run(run_id):
        raise HTTPException(404, "Encargo no encontrado.")

    async def stream():
        seq = int(last_event_id or 0)
        idle = 0.0
        gap_since: float | None = None
        while not await request.is_disconnected():
            events = await store.list_events(run_id, seq)
            # Parallel tool calls write events concurrently, so seq N+1 can become
            # visible before seq N. Deliver strictly in order; wait briefly for a gap.
            sent = []
            for e in events:
                if e["seq"] != seq + 1 and (gap_since is None or time.monotonic() - gap_since < 3):
                    gap_since = gap_since or time.monotonic()
                    break
                gap_since = None
                seq = e["seq"]
                sent.append(e)
                yield f"id: {seq}\nevent: {e['type']}\ndata: {json.dumps(e, ensure_ascii=False, default=str)}\n\n"
            events = sent or events
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
    token = settings().admin_token
    if not token:  # fail closed: no ADMIN_TOKEN outside test mode means no admin at all
        raise HTTPException(503, "Administración deshabilitada: falta ADMIN_TOKEN.")
    if not _bearer_ok(authorization, token):
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
async def reject_mandate(mandate_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    # Rejecting never moves money, but only the enrolled device may cancel a live demo.
    _require_stage(authorization)
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
async def passkeys_status(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    s = settings()
    keys = [p for p in await default_store().list_passkeys() if p.get("rp_id") == s.passkey_rp_id]
    base = {"registered": len(keys), "rp_id": s.passkey_rp_id}
    # Device names and ids only for the setup code holder; anonymous callers get the count.
    if not _bearer_ok(authorization, s.admin_token):
        return base
    return {
        **base,
        "labels": [p.get("label") for p in keys],
        # Ids are public (WebAuthn allowCredentials exposes them anyway); deleting needs the setup token.
        "passkeys": [
            {"id": p["id"], "label": p.get("label"), "created_at": p.get("created_at"), "last_used_at": p.get("last_used_at")}
            for p in sorted(keys, key=lambda k: k.get("created_at", 0))
        ],
    }


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
    """Removes an enrolled device (setup token required). Unknown ids are a 404."""
    _require_admin(authorization)
    if not any(p["id"] == passkey_id for p in await default_store().list_passkeys()):
        raise HTTPException(404, "Esa passkey no está registrada.")
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


# The audit is public (the audience uses it from their phones), so it is rate
# limited per client and runs in its own small pool: it can never starve a live run.
AUDIT_PER_MINUTE = 6
_audit_slots = asyncio.Semaphore(2)
_audit_hits: dict[str, list[float]] = {}


def _audit_allowed(client: str) -> bool:
    now = time.monotonic()
    hits = [t for t in _audit_hits.get(client, []) if now - t < 60]
    if len(hits) >= AUDIT_PER_MINUTE:
        _audit_hits[client] = hits
        return False
    hits.append(now)
    _audit_hits[client] = hits
    if len(_audit_hits) > 5000:  # bound memory: forget the oldest clients
        for key in list(_audit_hits)[:1000]:
            _audit_hits.pop(key, None)
    return True


@app.get("/audit")
async def audit(url: str, request: Request) -> dict[str, Any]:
    client = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    if not _audit_allowed(client):
        raise HTTPException(429, "Demasiadas auditorías seguidas. Espera un minuto.")
    # SSRF guard: public http(s) hosts only (plus the demo's own stores).
    allowed = {urlparse(s).netloc for s in settings().default_stores}
    if _audit_slots.locked():
        raise HTTPException(503, "Hay otras auditorías en curso. Intenta en unos segundos.")
    async with _audit_slots:
        try:
            return await asyncio.wait_for(audit_store(url, guard=True, allowed_hosts=allowed), 30)
        except UnsafeURL as e:
            raise HTTPException(400, str(e)) from e
        except asyncio.TimeoutError as e:
            raise HTTPException(504, "La tienda tardó demasiado en responder.") from e


@app.get("/screenshots/{shot_id}.jpg")
async def get_screenshot(shot_id: str) -> Response:
    shot = await default_store().get_screenshot(shot_id)
    if not shot:
        raise HTTPException(404, "Captura no encontrada.")
    return Response(base64.b64decode(shot["jpeg_b64"]), media_type="image/jpeg")


@app.post("/admin/warmup")
async def warmup(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """One short model call and a headless Chromium launch, so the first errand does not
    pay for cold clients, cold Vertex paths or browser start (the presenter page does this
    by itself through /stage/warmup)."""
    _require_admin(authorization)
    return await stage.warm_model_and_browser(force=True) or {}


@app.post("/admin/reset")
async def reset(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """Agent state only (runs, events, mandates, orders); /stage/reset also resets the stores."""
    _require_admin(authorization)
    from .runner import cancel_all

    cancelled = await cancel_all()
    await default_store().reset()
    return {"reset": True, "cancelled_runs": cancelled}


# --- Talk day, from the pages themselves (no commands) ---------------------------------


@app.get("/stage/status")
async def stage_status() -> dict[str, Any]:
    """Public: what is ready, so the presenter can say «Preparando…» or «Listo»."""
    return await stage.status()


class WarmupRequest(BaseModel):
    auto_reset: bool = False


@app.post("/stage/warmup")
async def stage_warmup(body: WarmupRequest | None = None) -> dict[str, Any]:
    """Public and cheap to repeat: wakes the stores; the model call and Chromium launch run at
    most every few minutes. With auto_reset, a page opened after a long idle period starts clean."""
    return await stage.warmup(auto_reset=bool(body and body.auto_reset))


@app.post("/stage/reset")
async def stage_reset(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """«Empezar de nuevo» on the presenter (enrolled device only)."""
    _require_stage(authorization)
    result = await stage.reset()
    if not result["reset"]:
        raise HTTPException(502, "No se pudo reiniciar: " + ", ".join(result.get("failed") or []))
    return result


class ControlRequest(BaseModel):
    enabled: bool


@app.post("/stage/control")
async def stage_control(body: ControlRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """The control-mode switch on the presenter (enrolled device only)."""
    _require_stage(authorization)
    result = await stage.control(body.enabled)
    if not result["ok"]:
        raise HTTPException(502, result["error"])
    return result


@app.post("/stage/session/passkey-options")
async def stage_session_options() -> dict[str, Any]:
    """Enable this browser with the registered passkey (Touch ID) instead of a setup code."""
    try:
        return await passkey.session_options(default_store())
    except passkey.PasskeyError as e:
        raise HTTPException(409, str(e)) from e


class SessionPasskey(BaseModel):
    flow_id: str
    credential: dict[str, Any]


@app.post("/stage/session/passkey")
async def stage_session_passkey(body: SessionPasskey) -> dict[str, Any]:
    s = settings()
    try:
        who = await passkey.verify_session(default_store(), body.flow_id, body.credential)
    except passkey.PasskeyError as e:
        raise HTTPException(401, str(e)) from e
    if s.stage_required and not s.stage_token:
        raise HTTPException(503, "El acceso de escenario no está configurado (STAGE_TOKEN).")
    return {"stage_token": s.stage_token, "required": s.stage_required, "label": who.get("label")}
