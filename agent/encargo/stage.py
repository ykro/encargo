"""Talk-day readiness, handled by the services themselves: nobody runs a command.

The presenter page calls these when it opens and while it stays open:

  status()   what is ready, in plain Spanish (stores up, agent warm, passkey, stock, control mode)
  warmup()   wakes the stores and, at most every few minutes, the model and Chromium; when nothing
             has happened for a while it also starts from a clean slate (reset)
  reset()    stores back to seed stock, Pulso opaque, runs/mandates/orders cleared
  control()  Pulso's control mode on/off (the same machine layer as Kilómetro)

The stores' admin endpoints need ADMIN_TOKEN; the agent holds it, the browser never does.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from .config import settings
from .runstore import TERMINAL_STATUSES, default_store

ERRAND_VARIANT = "SND-001-9"  # the errand's model in size 9
MIN_STOCK = 10
HEAVY_EVERY_S = 300  # one model call + Chromium launch at most this often
IDLE_RESET_S = 600  # a page opened after this long without errands starts from a clean slate

http_client_factory = lambda: httpx.AsyncClient(timeout=25)  # noqa: E731  (tests swap it)

_warm: dict[str, float] = {}
_heavy_lock = asyncio.Lock()


def _admin() -> dict[str, str]:
    return {"authorization": f"Bearer {settings().admin_token}"}


async def _store_state(http: httpx.AsyncClient, url: str) -> dict[str, Any]:
    t = time.monotonic()
    out: dict[str, Any] = {"url": url, "ok": False}
    try:
        res = await http.get(f"{url}/api/admin/agent-ready")
        body = res.json()
        out.update(ok=res.status_code == 200, key=body.get("store"), agent_ready=bool(body.get("agent_ready")))
        stock = await http.get(f"{url}/api/admin/stock", params={"variant": ERRAND_VARIANT}, headers=_admin())
        if stock.status_code == 200:
            out["stock"] = stock.json().get("qty")
    except (httpx.HTTPError, ValueError):
        pass
    out["ms"] = round((time.monotonic() - t) * 1000)
    return out


async def _stores(http: httpx.AsyncClient) -> list[dict[str, Any]]:
    return list(await asyncio.gather(*(_store_state(http, u.rstrip("/")) for u in settings().default_stores)))


def _name(key: str | None) -> str:
    return {"pulso": "Pulso", "kilometro": "Kilómetro"}.get(key or "", key or "una tienda")


async def _activity() -> tuple[bool, float | None]:
    """(a run is in flight, seconds since the last run started)."""
    run = await default_store().latest_run()
    if not run:
        return False, None
    return run.get("status") not in TERMINAL_STATUSES, time.time() - float(run.get("created_at") or 0)


async def status() -> dict[str, Any]:
    s = settings()
    async with http_client_factory() as http:
        stores = await _stores(http)
    passkeys = [p for p in await default_store().list_passkeys() if p.get("rp_id") == s.passkey_rp_id]
    active, since = await _activity()
    model_warm = s.mock_ai or not s.gemini_model or "model" in _warm
    browser_warm = not s.browser_enabled or "browser" in _warm
    problems: list[str] = []
    for st in stores:
        if not st["ok"]:
            problems.append(f"{_name(st.get('key'))} todavía no responde")
        elif st.get("stock") is not None and st["stock"] < MIN_STOCK:
            problems.append(f"{_name(st['key'])} tiene poco stock de la talla 9")
    if not passkeys:
        problems.append("No hay una passkey registrada para firmar")
    control = next((st["agent_ready"] for st in stores if st.get("key") == "pulso" and st["ok"]), None)
    ready = all(st["ok"] for st in stores) and bool(passkeys) and model_warm and browser_warm
    return {
        "ready": ready,
        "stores": [{"key": st.get("key"), "ok": st["ok"], "ms": st["ms"], "stock": st.get("stock")} for st in stores],
        "agent": {"mode": "mock" if s.mock_ai else "gemini", "model_warm": model_warm, "browser_warm": browser_warm},
        "passkeys": len(passkeys),
        "control": control,
        "run_active": active,
        "idle_s": None if since is None else round(since),
        "problems": problems,
    }


async def _warm_model_and_browser() -> dict[str, Any]:
    s = settings()
    out: dict[str, Any] = {}
    t = time.monotonic()
    if s.mock_ai or not s.gemini_model:
        out["model"] = "omitido (MOCK_AI)"
    else:
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=s.project, location=s.location)
        res = await client.aio.models.generate_content(
            model=s.gemini_model,
            contents="Responde solo: listo",
            config=types.GenerateContentConfig(thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)),
        )
        out["model"] = (res.text or "").strip()[:40]
        _warm["model"] = time.time()
    out["model_s"] = round(time.monotonic() - t, 1)
    t = time.monotonic()
    if s.browser_enabled:
        from .tools.browser import _get_browser

        await _get_browser()
        _warm["browser"] = time.time()
        out["browser"] = "listo"
    out["browser_s"] = round(time.monotonic() - t, 1)
    return out


async def warm_model_and_browser(force: bool = False) -> dict[str, Any] | None:
    """One short Gemini call and a Chromium launch; skipped if done in the last HEAVY_EVERY_S."""
    async with _heavy_lock:
        if not force and time.time() - _warm.get("heavy", 0) < HEAVY_EVERY_S:
            return None
        out = await _warm_model_and_browser()
        _warm["heavy"] = time.time()
        return out


async def _wake_store_pages(http: httpx.AsyncClient) -> None:
    paths = ["/", "/feed.xml", "/.well-known/ucp"]
    await asyncio.gather(
        *(http.get(f"{u.rstrip('/')}{p}") for u in settings().default_stores for p in paths),
        return_exceptions=True,
    )


async def warmup(auto_reset: bool = False) -> dict[str, Any]:
    async with http_client_factory() as http:
        await _wake_store_pages(http)
    reset_done = False
    if auto_reset:
        reset_done = (await reset(if_idle_s=IDLE_RESET_S))["reset"]
    await warm_model_and_browser()
    return {**await status(), "reset": reset_done}


async def reset(if_idle_s: float | None = None) -> dict[str, Any]:
    """Clean slate. With if_idle_s, only when no errand started in that long (never mid-demo)."""
    if if_idle_s is not None:
        active, since = await _activity()
        if active or (since is not None and since < if_idle_s):
            return {"reset": False, "reason": "hay un encargo reciente"}
    from .runner import cancel_all

    cancelled = await cancel_all()
    await default_store().reset()
    failed: list[str] = []
    async with http_client_factory() as http:
        async def call(url: str, name: str, **kw: Any) -> None:
            try:
                res = await http.post(url, headers=_admin(), **kw)
                if res.status_code >= 400:
                    failed.append(name)
            except httpx.HTTPError:
                failed.append(name)

        stores = await _stores(http)
        jobs = [call(f"{st['url']}/api/admin/reset", f"{_name(st.get('key'))}: stock y pedidos") for st in stores]
        jobs += [
            call(f"{st['url']}/api/admin/agent-ready", "Pulso: modo de control", json={"enabled": False})
            for st in stores
            if st.get("key") == "pulso"
        ]
        await asyncio.gather(*jobs)
    return {"reset": not failed, "cancelled_runs": cancelled, "failed": failed}


async def control(enabled: bool) -> dict[str, Any]:
    async with http_client_factory() as http:
        stores = await _stores(http)
        pulso = next((st for st in stores if st.get("key") == "pulso"), None)
        if not pulso:
            return {"ok": False, "error": "Pulso no responde."}
        res = await http.post(f"{pulso['url']}/api/admin/agent-ready", headers=_admin(), json={"enabled": enabled})
        if res.status_code >= 400:
            return {"ok": False, "error": "Pulso no aceptó el cambio."}
        return {"ok": True, "control": bool(res.json().get("agent_ready"))}
