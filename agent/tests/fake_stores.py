"""Two fake stores behind an httpx MockTransport, for tests without servers.

- "km.test" publishes like Kilómetro: UCP profile, feed, signed checkouts, and a
  /complete that records every call (so tests can prove when payment happens).
- "pulso.test" publishes nothing machine-readable.
"""

from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Any

import httpx
from cryptography.hazmat.primitives.asymmetric import ec

from encargo.ap2.jose import b64url, jcs, public_jwk, sign_es256

FIX = Path(__file__).parent / "fixtures"
KM = "http://km.test"
PULSO = "http://pulso.test"


class FakeStores:
    def __init__(self) -> None:
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.kid = "km-test"
        self.checkouts: dict[str, dict[str, Any]] = {}
        self.complete_calls: list[dict[str, Any]] = []
        # The real feed was captured from Kilómetro at localhost:3001.
        self.feed = (FIX / "kilometro_feed.xml").read_text().replace("http://localhost:3001", KM)

    def sign(self, checkout: dict[str, Any]) -> dict[str, Any]:
        header = b64url(json.dumps({"alg": "ES256", "kid": self.kid}, separators=(",", ":")))
        payload = b64url(jcs({k: v for k, v in checkout.items() if k != "ap2"}))
        return {**checkout, "ap2": {"merchant_authorization": f"{header}..{sign_es256(f'{header}.{payload}', self.key)}"}}

    def profile(self) -> dict[str, Any]:
        caps = ["dev.ucp.shopping.catalog.search", "dev.ucp.shopping.checkout", "dev.ucp.common.payment.ap2_mandate"]
        return {
            "ucp": {
                "version": "2026-08-25",
                "services": {"dev.ucp.shopping": [{"transport": "rest", "endpoint": f"{KM}/ucp/v1"}]},
                "capabilities": {c: [{"version": "2026-08-25"}] for c in caps},
                "payment_handlers": {"org.example.sandbox_pay": [{"id": "sandbox_pay"}]},
            },
            "keys": [public_jwk(self.key, self.kid)],
        }

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        path = request.url.path
        if url.startswith(PULSO):
            if path == "/":
                return httpx.Response(200, text="<html><head><title>Pulso</title></head><body><div id=root></div></body></html>")
            return httpx.Response(404, text="Not found")
        if path == "/.well-known/ucp":
            return httpx.Response(200, json=self.profile())
        if path == "/feed.xml":
            return httpx.Response(200, text=self.feed)
        if path == "/":
            return httpx.Response(200, text="<html><head><title>Kilómetro</title></head><body>Tenis</body></html>")
        if path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if path == "/ucp/v1/checkout-sessions" and request.method == "POST":
            body = json.loads(request.content)
            variant = body["line_items"][0]["item"]["id"]
            checkout = {
                "id": f"chk_{secrets.token_hex(4)}",
                "status": "ready_for_complete",
                "currency": "USD",
                "line_items": [{"id": "li_1", "item": {"id": variant, "title": "Senda Acatenango T3 — talla 9", "price": 14500}, "quantity": 1}],
                "totals": [{"type": "subtotal", "amount": 14500}, {"type": "fulfillment", "amount": 0}, {"type": "total", "amount": 14500}],
                "links": [],
            }
            signed = self.sign(checkout)
            self.checkouts[checkout["id"]] = signed
            return httpx.Response(201, json=signed)
        if path.endswith("/complete"):
            body = json.loads(request.content)
            self.complete_calls.append({"path": path, "body": body, "headers": dict(request.headers)})
            if not (body.get("ap2") or {}).get("checkout_mandate"):
                return httpx.Response(403, json={"messages": [{"code": "mandate_missing", "content": "Falta el mandato"}]})
            checkout_id = path.split("/")[-2]
            done = self.sign({**self.checkouts[checkout_id], "status": "completed", "order": {"id": "ord_test", "label": "Pedido TEST"}})
            return httpx.Response(200, json=done)
        return httpx.Response(404, text="Not found")

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler), timeout=5)
