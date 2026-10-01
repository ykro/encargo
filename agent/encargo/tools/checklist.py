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


async def record_checklist(ctx: RunContext, store_url: str, product: str, results: dict[str, str]) -> dict[str, Any]:
    """One call per store: {"talla": "met — talla 9 en stock", ...} → one checklist row each."""
    recorded, errors = [], []
    for condition_id, value in results.items():
        status, _, evidence = value.partition("—")
        status = status.strip().strip(":").strip().lower().replace(" ", "_")
        if status not in VALID:
            errors.append(f"{condition_id}: estado inválido «{status}»")
            continue
        try:
            out = await record_check(ctx, store_url, condition_id, status, evidence.strip() or status, product)
        except ValueError as e:
            errors.append(str(e))
            continue
        if out.get("recorded"):
            recorded.append(condition_id)
        else:
            errors.append(f"{condition_id}: {out.get('error')}")
    missing = [c.id for c in ctx.conditions if c.id not in ctx.checklist.get(ctx.store_url(store_url), {})]
    return {"recorded": recorded, "errors": errors, "pending_for_store": missing}
