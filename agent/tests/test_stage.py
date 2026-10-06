"""Talk day without commands: the presenter page wakes, checks and resets everything itself."""

from __future__ import annotations

import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from encargo import api, stage
from encargo.runstore import default_store

PULSO, KM = "http://pulso.test", "http://km.test"


class AdminStores:
    """Both stores' admin endpoints, with the same ADMIN_TOKEN rule as stores/shared/src/admin.ts."""

    def __init__(self) -> None:
        self.control = False
        self.stock = {PULSO: 40, KM: 40}
        self.resets: list[str] = []
        self.down: set[str] = set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        base = f"{request.url.scheme}://{request.url.host}"
        if base in self.down:
            raise httpx.ConnectError("down")
        key = "pulso" if base == PULSO else "kilometro"
        admin = request.headers.get("authorization") == "Bearer dev-admin"
        path = request.url.path
        if path == "/api/admin/agent-ready":
            if request.method == "GET":
                return httpx.Response(200, json={"store": key, "agent_ready": key == "pulso" and self.control})
            if not admin:
                return httpx.Response(401, json={"error": "No autorizado"})
            self.control = bool(json.loads(request.content).get("enabled"))
            return httpx.Response(200, json={"store": key, "agent_ready": self.control})
        if path == "/api/admin/stock":
            return httpx.Response(200, json={"qty": self.stock[base]}) if admin else httpx.Response(401)
        if path == "/api/admin/reset":
            if not admin:
                return httpx.Response(401)
            self.resets.append(key)
            self.stock[base] = 40
            return httpx.Response(200, json={"reset": True})
        return httpx.Response(200, text="ok")

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler), timeout=5)


@pytest.fixture(autouse=True)
def clean_store():
    import asyncio

    store = default_store()
    asyncio.run(store.reset())
    saved = dict(store.passkeys)  # passkeys survive a reset (as in Firestore): isolate them here
    store.passkeys.clear()
    yield
    asyncio.run(store.reset())
    store.passkeys.clear()
    store.passkeys.update(saved)


@pytest.fixture
def stores(monkeypatch):
    fake = AdminStores()
    monkeypatch.setenv("STORE_URLS", f"{PULSO},{KM}")
    monkeypatch.setattr(stage, "http_client_factory", fake.client)
    stage._warm.clear()
    return fake


@pytest.fixture
def client():
    return TestClient(api.app)


async def _register_passkey() -> None:
    await default_store().save_passkey({"id": "pk1", "label": "portátil", "rp_id": "localhost", "public_key": "x", "sign_count": 0})


def test_status_is_ready_once_stores_answer_and_a_passkey_exists(stores, client):
    body = client.get("/stage/status").json()
    assert body["ready"] is False and "No hay una passkey registrada para firmar" in body["problems"]

    import asyncio

    asyncio.run(_register_passkey())
    body = client.get("/stage/status").json()
    assert body["ready"] is True, body
    assert body["control"] is False
    assert {s["key"] for s in body["stores"]} == {"pulso", "kilometro"}


def test_status_names_a_cold_store_and_low_stock(stores, client):
    stores.down.add(KM)
    stores.stock[PULSO] = 3
    body = client.get("/stage/status").json()
    assert body["ready"] is False
    assert "una tienda todavía no responde" in body["problems"]
    assert "Pulso tiene poco stock de la talla 9" in body["problems"]


def test_reset_and_control_need_the_enrolled_device(stores, client, monkeypatch):
    monkeypatch.setenv("SIGNER_MODE", "passkey")
    monkeypatch.setenv("STAGE_TOKEN", "stage-1")
    assert client.post("/stage/reset").status_code == 401
    assert client.post("/stage/control", json={"enabled": True}).status_code == 401
    ok = {"authorization": "Bearer stage-1"}
    assert client.post("/stage/control", json={"enabled": True}, headers=ok).json() == {"ok": True, "control": True}
    assert stores.control is True
    assert client.post("/stage/reset", headers=ok).json()["reset"] is True
    assert sorted(stores.resets) == ["kilometro", "pulso"] and stores.control is False


def test_warmup_resets_only_after_a_long_idle_period(stores, client):
    import asyncio

    stores.control = True
    asyncio.run(default_store().create_run({"id": "r1", "status": "completed", "created_at": time.time() - 30}))
    body = client.post("/stage/warmup", json={"auto_reset": True}).json()
    assert body["reset"] is False and stores.control is True  # an errand 30 s ago: never mid-demo

    asyncio.run(default_store().update_run("r1", {"created_at": time.time() - stage.IDLE_RESET_S - 5}))
    body = client.post("/stage/warmup", json={"auto_reset": True}).json()
    assert body["reset"] is True and stores.control is False
    assert asyncio.run(default_store().latest_run()) is None


def test_warmup_never_resets_while_a_run_is_in_flight(stores, client):
    import asyncio

    asyncio.run(default_store().create_run({"id": "r2", "status": "awaiting_approval", "created_at": time.time() - 3600}))
    assert client.post("/stage/warmup", json={"auto_reset": True}).json()["reset"] is False


def test_session_passkey_options_need_a_registered_passkey(stores, client):
    assert client.post("/stage/session/passkey-options").status_code == 409
    import asyncio

    asyncio.run(_register_passkey())
    body = client.post("/stage/session/passkey-options").json()
    assert body["flow_id"].startswith("ses_") and "challenge" in json.loads(body["options"])
    bad = client.post("/stage/session/passkey", json={"flow_id": body["flow_id"], "credential": {"id": "nope"}})
    assert bad.status_code == 401
