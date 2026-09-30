"""A software WebAuthn authenticator for tests and the bias test.

It behaves like a platform passkey (ES256 key, user present + verified) so the
bias test exercises the real passkey path end to end, the same way Chrome's
virtual authenticator does in browser automation. It can only be enrolled
with the setup token, like any other passkey.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import struct
from typing import Any

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

from .ap2.jose import b64url, from_b64url

FLAGS_UP_UV = 0x01 | 0x04
FLAG_AT = 0x40


class SoftwareAuthenticator:
    def __init__(self, origin: str, rp_id: str) -> None:
        self.origin, self.rp_id = origin, rp_id
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = secrets.token_bytes(16)
        self.sign_count = 0

    @property
    def id(self) -> str:
        return b64url(self.credential_id)

    def _rp_hash(self) -> bytes:
        return hashlib.sha256(self.rp_id.encode()).digest()

    def _client_data(self, kind: str, challenge: str) -> bytes:
        return json.dumps({"type": kind, "challenge": challenge, "origin": self.origin, "crossOrigin": False}).encode()

    def _cose_key(self) -> bytes:
        n = self.key.public_key().public_numbers()
        return cbor2.dumps({1: 2, 3: -7, -1: 1, -2: n.x.to_bytes(32, "big"), -3: n.y.to_bytes(32, "big")})

    def register(self, options: dict[str, Any]) -> dict[str, Any]:
        """Answers navigator.credentials.create() options (JSON form)."""
        client_data = self._client_data("webauthn.create", options["challenge"])
        attested = bytes(16) + struct.pack(">H", len(self.credential_id)) + self.credential_id + self._cose_key()
        auth_data = self._rp_hash() + bytes([FLAGS_UP_UV | FLAG_AT]) + struct.pack(">I", self.sign_count) + attested
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": self.id,
            "rawId": self.id,
            "type": "public-key",
            "response": {"clientDataJSON": b64url(client_data), "attestationObject": b64url(attestation), "transports": ["internal"]},
            "clientExtensionResults": {},
        }

    def sign(self, options: dict[str, Any]) -> dict[str, Any]:
        """Answers navigator.credentials.get() options (JSON form)."""
        allowed = [c["id"] for c in options.get("allowCredentials", [])]
        if allowed and self.id not in allowed:
            raise ValueError("this authenticator holds none of the allowed credentials")
        self.sign_count += 1
        client_data = self._client_data("webauthn.get", options["challenge"])
        auth_data = self._rp_hash() + bytes([FLAGS_UP_UV]) + struct.pack(">I", self.sign_count)
        signature = self.key.sign(auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()))
        return {
            "id": self.id,
            "rawId": self.id,
            "type": "public-key",
            "response": {
                "clientDataJSON": b64url(client_data),
                "authenticatorData": b64url(auth_data),
                "signature": b64url(signature),
                "userHandle": b64url(b"encargo-persona"),
            },
            "clientExtensionResults": {},
        }


def challenge_of(options: dict[str, Any]) -> bytes:
    return from_b64url(options["challenge"])
