"""The Encargo platform signer: turns the person's approval into an AP2 mandate.

Only a human approval reaches this module (the API's sign endpoint, never an
agent tool). It builds an AP2 v0.2 closed Checkout Mandate (vct
"mandate.checkout.1") as an SD-JWT, signed with the platform key published in
the agent's /.well-known/ucp — the "trusted platform provider" model of the
UCP AP2 Mandates extension. In Phase 2 the approval is a WebAuthn passkey
assertion from the person's phone; today it is a test-mode signer.
"""

from __future__ import annotations

import json
import secrets
import time
from functools import lru_cache
from typing import Any

from cryptography.hazmat.primitives.asymmetric import ec

from ..config import settings
from .jose import b64url, compact_jws, key_from_jwk, private_jwk, public_jwk, sha256_b64url
from .merchant_signature import checkout_jwt

CHECKOUT_MANDATE_VCT = "mandate.checkout.1"
MANDATE_TTL_S = 15 * 60


class PlatformKey:
    def __init__(self, key: ec.EllipticCurvePrivateKey, kid: str) -> None:
        self.key, self.kid = key, kid

    @property
    def public_jwk(self) -> dict[str, str]:
        return public_jwk(self.key, self.kid)

    def export_private(self) -> str:
        return json.dumps(private_jwk(self.key, self.kid))


@lru_cache(maxsize=1)
def platform_key() -> PlatformKey:
    raw = settings().platform_signing_jwk
    if raw:
        jwk = json.loads(raw)
        return PlatformKey(key_from_jwk(jwk), jwk.get("kid", "encargo-platform"))
    return PlatformKey(ec.generate_private_key(ec.SECP256R1()), f"encargo-{secrets.token_hex(4)}")


def _disclosure(*parts: Any) -> str:
    return b64url(json.dumps([secrets.token_urlsafe(16), *parts], separators=(",", ":"), ensure_ascii=False))


def build_checkout_mandate(checkout: dict[str, Any], audience: str, issuer: str, key: PlatformKey | None = None) -> str:
    """SD-JWT: <issuer-jwt>~<mandate disclosure>~<checkout_jwt disclosure>~"""
    key = key or platform_key()
    jwt_of_checkout = checkout_jwt(checkout)
    jwt_disclosure = _disclosure("checkout_jwt", jwt_of_checkout)
    mandate_disclosure = _disclosure(
        {"_sd": [sha256_b64url(jwt_disclosure)], "vct": CHECKOUT_MANDATE_VCT, "checkout_hash": sha256_b64url(jwt_of_checkout)}
    )
    now = int(time.time())
    payload = {
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + MANDATE_TTL_S,
        "nonce": checkout["id"],
        "_sd_alg": "sha-256",
        "delegate_payload": [{"...": sha256_b64url(mandate_disclosure)}],
    }
    issuer_jwt = compact_jws(payload, {"alg": "ES256", "typ": "dc+sd-jwt", "kid": key.kid}, key.key)
    return f"{issuer_jwt}~{mandate_disclosure}~{jwt_disclosure}~"
