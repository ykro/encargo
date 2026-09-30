"""After the person approves: sign the AP2 mandate and complete the checkout.

This module is reachable only from the human approval endpoint (api.py), never
from an agent tool. No signature, no call to /complete, no order.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from .ap2.signer import build_checkout_mandate
from .config import settings
from .runstore import RunStore
from .tools.ucp_client import summarize_checkout

SANDBOX_INSTRUMENT = {
    "id": "instr_sandbox",
    "handler_id": "sandbox_pay",
    "type": "card",
    "selected": True,
    "display": {"description": "Tarjeta de prueba •••• 4242"},
    "credential": {"type": "PAYMENT_GATEWAY", "token": "sandbox_tok_ok"},
}


async def _emit(store: RunStore, run_id: str, type_: str, **data: Any) -> None:
    await store.append_event(run_id, {"type": type_, "at": time.time(), **data})


async def reject(store: RunStore, mandate_id: str) -> dict[str, Any]:
    mandate = await store.get_mandate(mandate_id)
    if not mandate or mandate["status"] != "pending_signature":
        return {"ok": False, "error": "Mandato no encontrado o ya resuelto."}
    await store.update_mandate(mandate_id, {"status": "rejected", "rejected_at": time.time()})
    await store.update_run(mandate["run_id"], {"status": "rejected"})
    await _emit(store, mandate["run_id"], "approval_rejected", mandate_id=mandate_id)
    await _emit(store, mandate["run_id"], "run_finished", status="rejected")
    return {"ok": True, "status": "rejected"}


async def sign_and_complete(store: RunStore, mandate_id: str, approved_by: str, http: httpx.AsyncClient | None = None) -> dict[str, Any]:
    mandate = await store.get_mandate(mandate_id)
    if not mandate:
        return {"ok": False, "error": "Mandato no encontrado."}
    if mandate["status"] != "pending_signature":
        return {"ok": False, "error": f"El mandato ya está {mandate['status']}."}
    run_id, checkout = mandate["run_id"], mandate["checkout"]
    s = settings()

    token = build_checkout_mandate(checkout, audience=mandate["store"], issuer=s.profile_url)
    await store.update_mandate(
        mandate_id, {"status": "signed", "signed_at": time.time(), "approved_by": approved_by, "checkout_mandate": token}
    )
    await store.update_run(run_id, {"status": "completing"})
    await _emit(store, run_id, "mandate_signed", mandate_id=mandate_id, approved_by=approved_by, vct="mandate.checkout.1")

    own_client = http is None
    client = http or httpx.AsyncClient(timeout=20)
    try:
        res = await client.post(
            f"{mandate['endpoint']}/checkout-sessions/{checkout['id']}/complete",
            json={"payment": {"instruments": [SANDBOX_INSTRUMENT]}, "ap2": {"checkout_mandate": token}},
            headers={"UCP-Agent": f'profile="{s.profile_url}"', "content-type": "application/json"},
        )
        body = res.json()
    finally:
        if own_client:
            await client.aclose()

    if res.status_code != 200 or body.get("status") != "completed":
        reason = "; ".join(m.get("content", "") for m in body.get("messages", [])) or f"HTTP {res.status_code}"
        await store.update_mandate(mandate_id, {"status": "failed", "error": reason})
        await store.update_run(run_id, {"status": "failed", "error": reason})
        await _emit(store, run_id, "order_failed", reason=reason)
        await _emit(store, run_id, "run_finished", status="failed")
        return {"ok": False, "error": reason}

    order = {
        "id": body["order"]["id"],
        "run_id": run_id,
        "mandate_id": mandate_id,
        "store": mandate["store"],
        "label": body["order"].get("label"),
        "permalink_url": body["order"].get("permalink_url"),
        **summarize_checkout(body),
        "created_at": time.time(),
    }
    await store.save_order(order)
    await store.update_mandate(mandate_id, {"status": "completed", "order_id": order["id"]})
    run = await store.get_run(run_id) or {}
    elapsed = round(time.time() - run.get("created_at", time.time()), 1)
    await store.update_run(run_id, {"status": "completed", "order_id": order["id"], "elapsed_s": elapsed})
    await _emit(store, run_id, "order_confirmed", order=order, elapsed_s=elapsed)
    await _emit(store, run_id, "run_finished", status="completed")
    return {"ok": True, "order": order}
