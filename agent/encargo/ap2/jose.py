"""Minimal ES256 JWS + JCS helpers (the same primitives the stores use in TypeScript)."""

from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature, encode_dss_signature


def b64url(data: bytes | str) -> str:
    raw = data.encode() if isinstance(data, str) else data
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def from_b64url(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sha256_b64url(s: str) -> str:
    """SD-JWT digest: base64url(sha-256(ascii bytes))."""
    return b64url(hashlib.sha256(s.encode("ascii")).digest())


def jcs(value: Any) -> str:
    """JSON Canonicalization Scheme (RFC 8785) for our data: sorted keys, no spaces.

    Money is integer cents, so number formatting never differs from JavaScript.
    """
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _int_b64(n: int) -> str:
    return b64url(n.to_bytes(32, "big"))


def public_jwk(key: ec.EllipticCurvePrivateKey, kid: str) -> dict[str, str]:
    nums = key.public_key().public_numbers()
    return {"kty": "EC", "crv": "P-256", "x": _int_b64(nums.x), "y": _int_b64(nums.y), "kid": kid, "use": "sig", "alg": "ES256"}


def private_jwk(key: ec.EllipticCurvePrivateKey, kid: str) -> dict[str, str]:
    return {**public_jwk(key, kid), "d": _int_b64(key.private_numbers().private_value)}


def key_from_jwk(jwk: dict[str, str]) -> ec.EllipticCurvePrivateKey:
    return ec.derive_private_key(int.from_bytes(from_b64url(jwk["d"]), "big"), ec.SECP256R1())


def public_key_from_jwk(jwk: dict[str, str]) -> ec.EllipticCurvePublicKey:
    x = int.from_bytes(from_b64url(jwk["x"]), "big")
    y = int.from_bytes(from_b64url(jwk["y"]), "big")
    return ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1()).public_key()


def sign_es256(signing_input: str, key: ec.EllipticCurvePrivateKey) -> str:
    der = key.sign(signing_input.encode("ascii"), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    return b64url(r.to_bytes(32, "big") + s.to_bytes(32, "big"))


def verify_es256(signing_input: str, signature_b64: str, public: ec.EllipticCurvePublicKey) -> bool:
    raw = from_b64url(signature_b64)
    if len(raw) != 64:
        return False
    der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
    try:
        public.verify(der, signing_input.encode("ascii"), ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False


def compact_jws(payload: dict[str, Any], header: dict[str, Any], key: ec.EllipticCurvePrivateKey) -> str:
    h = b64url(json.dumps(header, separators=(",", ":")))
    p = b64url(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
    return f"{h}.{p}.{sign_es256(f'{h}.{p}', key)}"
