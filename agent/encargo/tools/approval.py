"""request_payment_approval: the agent's last step. It cannot pay; it asks.

The request carries the store-signed checkout. The person reviews it and signs
the AP2 mandate on their phone; only then does the purchase complete (see
encargo/purchase.py). The agent has no tool that signs or completes.
"""

from __future__ import annotations

import secrets
import time
from typing import Any

from ..run_context import RunContext


async def request_payment_approval(ctx: RunContext, store_url: str, checkout_id: str, reason: str) -> dict[str, Any]:
    store = ctx.store_url(store_url)
    entry = ctx.checkouts.get(checkout_id)
    if not entry or entry["store"] != store:
        return {"requested": False, "error": "Primero crea un checkout en esa tienda con create_checkout."}
    # Guardrail: money only moves toward a store where every condition was verified.
    if not ctx.all_met(store):
        pending = {c.id: ctx.checklist.get(store, {}).get(c.id, {}).get("status", "sin revisar") for c in ctx.conditions}
        return {"requested": False, "error": "No se puede pedir el pago: no todas las condiciones están verificadas.", "checklist": pending}
    if ctx.mandate_id:
        return {"requested": False, "error": "Ya hay una aprobación pendiente en este encargo."}

    from .ucp_client import summarize_checkout

    summary = summarize_checkout(entry["checkout"])
    mandate_id = f"mnd_{secrets.token_hex(8)}"
    await ctx.store.save_mandate(
        {
            "id": mandate_id,
            "run_id": ctx.run_id,
            "status": "pending_signature",
            "store": store,
            "endpoint": entry["endpoint"],
            "checkout": entry["checkout"],
            "summary": summary,
            "reason": reason,
            "created_at": time.time(),
        }
    )
    ctx.mandate_id = mandate_id
    await ctx.store.update_run(ctx.run_id, {"status": "awaiting_approval", "mandate_id": mandate_id, "chosen_store": store})
    await ctx.emit("approval_requested", mandate_id=mandate_id, store=store, reason=reason, **summary)
    return {
        "requested": True,
        "mandate_id": mandate_id,
        "status": "pendiente de firma",
        "next": "Detente aquí. La persona revisa y firma el mandato AP2 con su passkey.",
    }
