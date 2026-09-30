"""Trust and authorization: the agent stops before paying. Only the person's
signed AP2 mandate makes the purchase happen — and the agent cannot sign."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from encargo import api, purchase, runner
from encargo.agent import TOOLS
from encargo.errand import DEFAULT_ERRAND
from encargo.runstore import MemoryRunStore
from encargo.tools import browser

from .fake_stores import KM, PULSO, FakeStores


@pytest.fixture
def stores(monkeypatch):
    fake = FakeStores()
    monkeypatch.setattr(runner, "http_client_factory", fake.client)

    async def opaque_page(ctx, url):
        # What Chromium returns for Pulso: pictures, no data, no text.
        return {"url": url, "structured_data": "ninguno", "visible_text": "(sin texto visible)"}

    monkeypatch.setattr(browser, "browse_page", opaque_page)
    return fake


async def run_errand(store: MemoryRunStore, stores: list[str]) -> dict:
    run_id = await runner.start_run(store, DEFAULT_ERRAND, stores)
    await runner.wait_idle()
    return await store.get_run(run_id)


def test_agent_has_no_tool_that_signs_or_pays():
    names = {t.__name__ for t in TOOLS}
    assert "request_payment_approval" in names
    assert not {n for n in names if any(w in n for w in ("sign", "complete", "pay_", "mandate"))}


async def test_run_stops_at_approval_and_nothing_is_paid(stores):
    store = MemoryRunStore()
    run = await run_errand(store, [PULSO, KM])
    assert run["status"] == "awaiting_approval"
    assert run["chosen_store"] == KM
    assert stores.complete_calls == []  # the agent never reached /complete
    mandate = await store.get_mandate(run["mandate_id"])
    assert mandate["status"] == "pending_signature"
    statuses = {c: v["status"] for c, v in run["checklist"][PULSO].items()}
    assert set(statuses.values()) == {"not_verifiable"}


async def test_signed_mandate_completes_exactly_one_order(stores):
    store = MemoryRunStore()
    run = await run_errand(store, [KM, PULSO])
    async with stores.client() as http:
        result = await purchase.sign_and_complete(store, run["mandate_id"], "persona", http=http)
        again = await purchase.sign_and_complete(store, run["mandate_id"], "persona", http=http)
    assert result["ok"] and result["order"]["id"] == "ord_test"
    assert not again["ok"]
    assert len(stores.complete_calls) == 1
    call = stores.complete_calls[0]
    assert call["body"]["ap2"]["checkout_mandate"].count("~") == 3
    assert "encargo.test/.well-known/ucp" in call["headers"]["ucp-agent"]
    assert (await store.get_run(run["run_id"] if "run_id" in run else run["id"]))["status"] == "completed"


async def test_rejected_mandate_never_pays(stores):
    store = MemoryRunStore()
    run = await run_errand(store, [KM, PULSO])
    assert (await purchase.reject(store, run["mandate_id"]))["ok"]
    async with stores.client() as http:
        late = await purchase.sign_and_complete(store, run["mandate_id"], "persona", http=http)
    assert not late["ok"]
    assert stores.complete_calls == []


async def test_guardrail_refuses_approval_when_a_condition_is_not_verified(stores):
    from encargo.errand import parse_errand, today_gt
    from encargo.run_context import RunContext
    from encargo.tools import approval, checklist, ucp_client

    store = MemoryRunStore()
    async with stores.client() as http:
        ctx = RunContext("run_x", DEFAULT_ERRAND, [KM], parse_errand(DEFAULT_ERRAND, today_gt()), today_gt(), store, http, "http://encargo.test/.well-known/ucp")
        await store.create_run({"id": "run_x", "status": "running"})
        created = await ucp_client.create_checkout(ctx, KM, "SND-001-9")
        await checklist.record_check(ctx, KM, "categoria", "met", "trail")
        await checklist.record_check(ctx, KM, "talla", "met", "9")
        await checklist.record_check(ctx, KM, "precio", "met", "145")
        await checklist.record_check(ctx, KM, "entrega", "not_verifiable", "sin dato")
        refused = await approval.request_payment_approval(ctx, KM, created["checkout_id"], "prueba")
        ctx.close()
    assert refused["requested"] is False
    assert store.mandates == {}


def test_sign_endpoint_is_human_only(stores):
    client = TestClient(api.app)
    assert client.post("/mandates/mnd_x/sign").status_code == 401
    assert client.post("/mandates/mnd_x/sign", headers={"authorization": "Bearer guess"}).status_code == 401
    assert client.post("/mandates/mnd_x/sign", headers={"authorization": "Bearer human-test-token"}).status_code == 409  # unknown mandate


def test_platform_profile_publishes_the_mandate_key():
    body = TestClient(api.app).get("/.well-known/ucp").json()
    assert "dev.ucp.common.payment.ap2_mandate" in body["ucp"]["capabilities"]
    assert body["keys"][0]["kty"] == "EC" and "d" not in body["keys"][0]
