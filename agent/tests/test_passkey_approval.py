"""On stage the person approves with a passkey: a WebAuthn assertion over a
challenge derived from the store-signed checkout. Nothing else signs."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from encargo import api, runner
from encargo.errand import DEFAULT_ERRAND
from encargo.runstore import MemoryRunStore
from encargo.software_authenticator import SoftwareAuthenticator
from encargo.tools import browser

from .fake_stores import KM, PULSO, FakeStores

ADMIN = {"authorization": "Bearer dev-admin"}


@pytest.fixture
def world(monkeypatch):
    fake = FakeStores()
    store = MemoryRunStore()
    monkeypatch.setattr(runner, "http_client_factory", fake.client)
    monkeypatch.setattr(api, "default_store", lambda: store)

    async def opaque_page(ctx, url):
        return {"url": url, "structured_data": "ninguno"}

    monkeypatch.setattr(browser, "browse_page", opaque_page)

    # purchase.sign_and_complete opens its own client: route it to the fakes too.
    import httpx

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: real(transport=httpx.MockTransport(fake.handler), timeout=5))
    return fake, store


def enroll(client: TestClient, auth: SoftwareAuthenticator) -> None:
    opts = client.post("/passkeys/register/options", json={"label": "Teléfono de prueba"}, headers=ADMIN).json()
    res = client.post("/passkeys/register/verify", json={"flow_id": opts["flow_id"], "credential": auth.register(json.loads(opts["options"]))}, headers=ADMIN)
    assert res.status_code == 200, res.text


async def awaiting_run(store: MemoryRunStore) -> dict:
    run_id = await runner.start_run(store, DEFAULT_ERRAND, [PULSO, KM])
    await runner.wait_idle()
    return await store.get_run(run_id)


def test_registration_needs_the_setup_token(world):
    client = TestClient(api.app)
    assert client.post("/passkeys/register/options", json={}).status_code == 401
    assert client.get("/passkeys/status").json()["registered"] == 0


async def test_passkey_signature_completes_the_order(world):
    fake, store = world
    client = TestClient(api.app)
    phone = SoftwareAuthenticator("http://localhost:3000", "localhost")
    enroll(client, phone)
    run = await awaiting_run(store)

    opts = client.post(f"/mandates/{run['mandate_id']}/passkey-options").json()
    mandate = client.get(f"/mandates/{run['mandate_id']}").json()
    assert opts["checkout_hash"] == mandate["checkout_hash"]
    res = client.post(
        f"/mandates/{run['mandate_id']}/sign", json={"flow_id": opts["flow_id"], "credential": phone.sign(json.loads(opts["options"]))}
    )
    assert res.status_code == 200, res.text
    assert len(fake.complete_calls) == 1
    signed = await store.get_mandate(run["mandate_id"])
    assert signed["approval"]["method"] == "passkey" and signed["approval"]["user_verified"]


async def test_wrong_origin_unregistered_key_or_replay_never_pays(world):
    fake, store = world
    client = TestClient(api.app)
    phone = SoftwareAuthenticator("http://localhost:3000", "localhost")
    enroll(client, phone)
    run = await awaiting_run(store)
    mid = run["mandate_id"]

    def attempt(authenticator):
        opts = client.post(f"/mandates/{mid}/passkey-options").json()
        return opts, client.post(f"/mandates/{mid}/sign", json={"flow_id": opts["flow_id"], "credential": authenticator.sign(json.loads(opts["options"]))})

    phishing = SoftwareAuthenticator("https://evil.example", "localhost")
    phishing.credential_id, phishing.key = phone.credential_id, phone.key
    assert attempt(phishing)[1].status_code == 401

    stranger = SoftwareAuthenticator("http://localhost:3000", "localhost")
    opts = client.post(f"/mandates/{mid}/passkey-options").json()
    forged = stranger.sign({**json.loads(opts["options"]), "allowCredentials": []})
    assert client.post(f"/mandates/{mid}/sign", json={"flow_id": opts["flow_id"], "credential": forged}).status_code == 401

    opts, ok = attempt(phone)
    assert ok.status_code == 200
    replay = client.post(f"/mandates/{mid}/sign", json={"flow_id": opts["flow_id"], "credential": phone.sign(json.loads(opts["options"]))})
    assert replay.status_code in (401, 409)
    assert len(fake.complete_calls) == 1


def test_passkey_mode_rejects_the_test_token(world, monkeypatch):
    monkeypatch.setenv("SIGNER_MODE", "passkey")
    client = TestClient(api.app)
    res = client.post("/mandates/mnd_x/sign", headers={"authorization": "Bearer human-test-token"})
    assert res.status_code == 401


def test_status_lists_ids_and_delete_needs_the_setup_token(world):
    client = TestClient(api.app)
    phone = SoftwareAuthenticator("http://localhost:3000", "localhost")
    enroll(client, phone)
    assert "passkeys" not in client.get("/passkeys/status").json()  # anonymous: count only
    status = client.get("/passkeys/status", headers=ADMIN).json()
    assert status["passkeys"][0]["id"] == phone.id
    assert client.delete(f"/passkeys/{phone.id}").status_code == 401
    assert client.delete("/passkeys/unknown", headers=ADMIN).status_code == 404
    assert client.delete(f"/passkeys/{phone.id}", headers=ADMIN).status_code == 200
    assert client.get("/passkeys/status").json()["registered"] == 0
