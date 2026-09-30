"""record_check: one row of the per-store checklist — met, not met or not verifiable."""

from __future__ import annotations

from typing import Any

from ..run_context import STATUS_LABEL, RunContext

VALID = set(STATUS_LABEL)


async def record_check(ctx: RunContext, store_url: str, condition_id: str, status: str, evidence: str, product: str = "") -> dict[str, Any]:
    store = ctx.store_url(store_url)
    condition = ctx.condition(condition_id)
    if status not in VALID:
        return {"recorded": False, "error": f"status debe ser uno de {sorted(VALID)}"}
    ctx.checklist.setdefault(store, {})[condition.id] = {"status": status, "evidence": evidence}
    await ctx.emit(
        "checklist",
        store=store,
        condition_id=condition.id,
        label=condition.label,
        status=status,
        status_label=STATUS_LABEL[status],
        evidence=evidence,
        product=product,
    )
    missing = [c.id for c in ctx.conditions if c.id not in ctx.checklist[store]]
    return {"recorded": True, "store": store, "condition": condition.id, "pending_for_store": missing}
