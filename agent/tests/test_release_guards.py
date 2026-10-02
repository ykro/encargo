"""Release guards: the README's promises, checked case by case.

- Money only moves toward a checkout that is exactly the errand.
- One signature wins, even when two arrive at once.
- A broken store response ends the run visibly; it never hangs.
- On stage, only an enrolled device starts errands or cancels; nobody can point
  the agent elsewhere, read mandate ids anonymously, or use the audit as a proxy.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from encargo import api, purchase, runner
from encargo.errand import DEFAULT_ERRAND, parse_errand, today_gt
from encargo.run_context import RunContext
from encargo.runstore import MemoryRunStore
from encargo.tools import browser

from .fake_stores import KM, PULSO, FakeStores


@pytest.fixture
def fake(monkeypatch):
    fake = FakeStores()
    monkeypatch.setattr(runner, "http_client_factory", fake.client)

    async def opaque_page(ctx, url):
        return {"url": url, "structured_data": "ninguno"}

    monkeypatch.setattr(browser, "browse_page", opaque_page)
    return fake


async def run(store: MemoryRunStore, errand: str = DEFAULT_ERRAND) -> dict:
    run_id = await runner.start_run(store, errand, [PULSO, KM])
    await runner.wait_idle()
    return await store.get_run(run_id)


# ── Deterministic checkout guardrail ─────────────────────────────────────────
@pytest.mark.parametrize(
    "knob,value",
    [
        ("checkout_quantity", 2),  # two pairs
        ("checkout_variant", "SND-001-10"),  # wrong size
        ("checkout_total_cents", 15000),  # not under 150 USD
        ("checkout_delivery_days", 8),  # after Friday
    ],
)
async def test_no_approval_for_a_checkout_that_is_not_the_errand(fake, knob, value):
    setattr(fake, knob, value)
    store = MemoryRunStore()
    result = await run(store)
    assert result["status"] == "no_purchase"
    assert store.mandates == {}
    assert fake.complete_calls == []


async def test_the_exact_errand_checkout_is_approved(fake):
    store = MemoryRunStore()
    assert (await run(store))["status"] == "awaiting_approval"


async def test_an_errand_missing_a_condition_can_never_be_bought(fake):
    store = MemoryRunStore()
    result = await run(store, "Tenis para trail, talla 9, menos de 150 USD.")  # no deadline
    assert result["status"] == "no_purchase"
    assert store.mandates == {}


def test_all_met_is_false_without_conditions():
    ctx = RunContext("r", "", [KM], [], today_gt(), MemoryRunStore(), None, "")  # type: ignore[arg-type]
    ctx.checklist[KM] = {}
    assert ctx.all_met(KM) is False
    ctx.close()


def test_all_met_needs_all_four_kinds():
    conditions = [c for c in parse_errand(DEFAULT_ERRAND, today_gt()) if c.kind != "deliver_by"]
    ctx = RunContext("r2", "", [KM], conditions, today_gt(), MemoryRunStore(), None, "")  # type: ignore[arg-type]
    ctx.checklist[KM] = {c.id: {"status": "met", "evidence": ""} for c in conditions}
    assert ctx.all_met(KM) is False
    ctx.close()


# ── Double-complete race ─────────────────────────────────────────────────────
async def test_two_concurrent_signatures_complete_one_order(fake):
    store = MemoryRunStore()
    result = await run(store)
    async with fake.client() as http:
        a, b = await asyncio.gather(
            purchase.sign_and_complete(store, result["mandate_id"], "persona", http=http),
            purchase.sign_and_complete(store, result["mandate_id"], "persona", http=http),
        )
    assert sorted([a["ok"], b["ok"]]) == [False, True]
    assert len(fake.complete_calls) == 1
    assert len(await store.list_orders()) == 1


async def test_sign_and_reject_race_has_one_winner(fake):
    store = MemoryRunStore()
    result = await run(store)
    async with fake.client() as http:
        signed, rejected = await asyncio.gather(
            purchase.sign_and_complete(store, result["mandate_id"], "persona", http=http),
            purchase.reject(store, result["mandate_id"]),
        )
    assert [signed["ok"], rejected["ok"]].count(True) == 1


# ── Broken store response ────────────────────────────────────────────────────
async def test_non_json_store_error_fails_the_run_visibly(fake):
    fake.complete_response = httpx.Response(502, text="<html>Bad gateway</html>")
    store = MemoryRunStore()
    result = await run(store)
    async with fake.client() as http:
        out = await purchase.sign_and_complete(store, result["mandate_id"], "persona", http=http)
    assert out["ok"] is False and "502" in out["error"]
    final = await store.get_run(result["id"])
    assert final["status"] == "failed"
    types = [e["type"] for e in await store.list_events(result["id"])]
    assert types[-2:] == ["order_failed", "run_finished"]
    assert (await store.get_mandate(result["mandate_id"]))["status"] == "failed"


# ── Stage access (passkey mode) ──────────────────────────────────────────────
@pytest.fixture
def stage(monkeypatch, fake):
    store = MemoryRunStore()
    monkeypatch.setattr(api, "default_store", lambda: store)
    monkeypatch.setenv("SIGNER_MODE", "passkey")
    monkeypatch.setenv("STAGE_TOKEN", "stage-1")
    monkeypatch.setenv("ADMIN_TOKEN", "admin-1")
    monkeypatch.setenv("STORE_URLS", f"{PULSO},{KM}")
    return store


def test_runs_need_the_stage_token_and_ignore_client_stores(stage):
    client = TestClient(api.app)
    assert client.post("/runs", json={}).status_code == 401
    res = client.post("/runs", json={"stores": ["http://evil.test"]}, headers={"authorization": "Bearer stage-1"})
    assert res.status_code == 201
    run = stage.runs[res.json()["id"]]
    assert sorted(run["stores"]) == sorted([PULSO, KM])


def test_stage_session_needs_the_setup_code(stage):
    client = TestClient(api.app)
    assert client.post("/stage/session").status_code == 401
    body = client.post("/stage/session", headers={"authorization": "Bearer admin-1"}).json()
    assert body == {"stage_token": "stage-1", "required": True}


async def test_latest_run_hides_the_mandate_from_anonymous_callers(stage):
    await run(stage)
    client = TestClient(api.app)
    assert "mandate_id" not in client.get("/runs/latest").json()
    assert "mandate_id" in client.get("/runs/latest", headers={"authorization": "Bearer stage-1"}).json()
    mid = next(iter(stage.mandates))
    assert client.post(f"/mandates/{mid}/reject").status_code == 401


def test_admin_fails_closed_without_a_token(monkeypatch):
    monkeypatch.setenv("SIGNER_MODE", "passkey")
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    client = TestClient(api.app)
    assert client.post("/admin/reset", headers={"authorization": "Bearer dev-admin"}).status_code == 503
    assert client.post("/passkeys/register/options", json={}, headers={"authorization": "Bearer dev-admin"}).status_code == 503


@pytest.mark.parametrize("url", ["http://169.254.169.254/latest/meta-data", "http://127.0.0.1:8000", "file:///etc/passwd", "http://10.1.2.3"])
def test_audit_refuses_non_public_hosts(url):
    assert TestClient(api.app).get("/audit", params={"url": url}).status_code == 400


async def test_reset_cancels_runs_in_flight(monkeypatch):
    store = MemoryRunStore()
    started = asyncio.Event()

    async def slow(*args, **kwargs):
        started.set()
        await asyncio.sleep(30)

    monkeypatch.setattr(runner, "execute_run", slow)
    await runner.start_run(store, DEFAULT_ERRAND, [KM])
    await started.wait()
    assert await runner.cancel_all() == 1
    await store.reset()
    assert store.runs == {}


def test_warmup_needs_admin_and_skips_the_model_in_mock_mode():
    client = TestClient(api.app)
    assert client.post("/admin/warmup").status_code == 401
    body = client.post("/admin/warmup", headers={"authorization": "Bearer dev-admin"}).json()
    assert body["model"].startswith("omitido")
