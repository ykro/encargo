"""Runs one errand end to end (up to the approval request) and streams every
step as an event: what the agent does, what it sees, the checklist, the decision."""

from __future__ import annotations

import asyncio
import secrets
import time
from functools import lru_cache
from typing import Any

import httpx
from google.adk.runners import InMemoryRunner
from google.genai import types

from .config import settings
from .errand import conditions_as_dicts, parse_errand, spanish_date, today_gt
from .run_context import RunContext
from .runstore import RunStore

STEP_LABEL = {
    "inspect_store": "Reviso qué publica la tienda para agentes",
    "read_product_feed": "Leo el feed de productos",
    "search_catalog": "Busco en el catálogo UCP",
    "fetch_page": "Leo la página como datos",
    "browse_page": "Abro la página en un navegador",
    "record_check": "Anoto una condición",
    "record_checklist": "Anoto la lista de verificación",
    "create_checkout": "Armo el checkout",
    "request_payment_approval": "Pido tu aprobación para pagar",
}

_tasks: set[asyncio.Task] = set()

# Tests swap this for a client with a fake transport.
http_client_factory = lambda: httpx.AsyncClient(timeout=20)  # noqa: E731


@lru_cache(maxsize=1)
def _adk_runner() -> InMemoryRunner:
    from .agent import build_agent

    return InMemoryRunner(agent=build_agent(), app_name="encargo")


async def start_run(store: RunStore, errand: str, stores: list[str], run_date=None) -> str:
    run_id = f"run_{secrets.token_hex(6)}"
    run_date = run_date or today_gt()
    conditions = parse_errand(errand, run_date)
    await store.create_run(
        {
            "id": run_id,
            "status": "running",
            "errand": errand,
            "stores": stores,
            "run_date": run_date.isoformat(),
            "conditions": conditions_as_dicts(conditions),
            "mode": "mock" if settings().mock_ai else "gemini",
            "created_at": time.time(),
        }
    )
    task = asyncio.create_task(execute_run(store, run_id, errand, stores, conditions, run_date))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return run_id


async def cancel_all() -> int:
    """`make reset`: stop runs in flight so they cannot write into the fresh state."""
    tasks = [t for t in _tasks if not t.done()]
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    return len(tasks)


async def wait_idle() -> None:
    """Waits for background runs (tests)."""
    while _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)


def _prompt(ctx: RunContext) -> str:
    lines = [f"Encargo: {ctx.errand}", f"Hoy es {spanish_date(ctx.run_date)} ({ctx.run_date.isoformat()}).", "Condiciones:"]
    lines += [f"- id={c.id}: {c.label} (valor: {c.value})" for c in ctx.conditions]
    lines += ["Tiendas:"] + [f"- {s}" for s in ctx.stores]
    return "\n".join(lines)


def _compact(value: Any, limit: int = 4000) -> Any:
    """Keeps events small enough for Firestore and the SSE stream."""
    import json

    text = json.dumps(value, ensure_ascii=False, default=str)
    return value if len(text) <= limit else {"truncated": text[:limit]}


async def _human_views(ctx: RunContext) -> None:
    """Presenter's left panel: what a person sees at each store's front page."""
    from .tools.browser import screenshot

    async def one(url: str) -> None:
        try:
            await screenshot(ctx, url, "human_view")
        except Exception:  # noqa: BLE001 — the presenter view is best effort
            pass

    await asyncio.gather(*(one(s) for s in ctx.stores))


async def _run_adk(ctx: RunContext) -> str:
    runner = _adk_runner()
    session = await runner.session_service.create_session(app_name="encargo", user_id="presenter", state={"run_id": ctx.run_id})
    final_text = ""
    message = types.Content(role="user", parts=[types.Part(text=_prompt(ctx))])
    async for event in runner.run_async(user_id="presenter", session_id=session.id, new_message=message):
        for part in event.content.parts if event.content and event.content.parts else []:
            if part.function_call:
                args = dict(part.function_call.args or {})
                await ctx.emit("step", tool=part.function_call.name, label=STEP_LABEL.get(part.function_call.name, part.function_call.name), args=args)
            elif part.function_response:
                await ctx.emit("observation", tool=part.function_response.name, data=_compact(part.function_response.response))
            elif part.text and not part.thought:
                final_text = part.text.strip()
                await ctx.emit("thought", text=final_text)
    return final_text


async def execute_run(store: RunStore, run_id: str, errand: str, stores: list[str], conditions, run_date) -> None:
    s = settings()
    async with http_client_factory() as http:
        ctx = RunContext(
            run_id=run_id,
            errand=errand,
            stores=stores,
            conditions=conditions,
            run_date=run_date,
            store=store,
            http=http,
            agent_profile_url=s.profile_url,
        )
        try:
            await ctx.emit("run_started", errand=errand, stores=stores, conditions=conditions_as_dicts(conditions))
            views = asyncio.create_task(_human_views(ctx)) if s.browser_enabled else None
            if s.mock_ai:
                from .mock_planner import run_mock

                summary = await asyncio.wait_for(run_mock(ctx), s.run_timeout_s)
            else:
                summary = await asyncio.wait_for(_run_adk(ctx), s.run_timeout_s)
            if views:
                await views
            decision = {"store": None, "summary": summary, "checklist": ctx.checklist}
            if ctx.mandate_id:
                run = await store.get_run(run_id) or {}
                decision["store"] = run.get("chosen_store")
                await ctx.emit("decision", **decision)
            else:
                await ctx.emit("decision", **decision)
                await store.update_run(run_id, {"status": "no_purchase", "summary": summary})
                await ctx.emit("run_finished", status="no_purchase")
            await store.update_run(run_id, {"checklist": ctx.checklist, "agent_seconds": round(time.monotonic() - ctx.started, 1)})
        except Exception as e:  # noqa: BLE001 — a failed run must be visible on stage, not silent
            reason = "Se agotó el tiempo del encargo." if isinstance(e, asyncio.TimeoutError) else f"{e.__class__.__name__}: {e}"
            await store.update_run(run_id, {"status": "failed", "error": reason})
            await ctx.emit("run_finished", status="failed", error=reason)
        finally:
            ctx.close()
