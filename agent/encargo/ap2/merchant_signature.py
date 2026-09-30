"""Checks the store's merchant_authorization before showing a checkout to the person.

UCP AP2 Mandates extension: the platform MUST verify the business signature
(detached JWS over JCS(checkout without "ap2")) with a key from the store's
/.well-known/ucp `keys[]`. If it fails, the person never sees those terms.
"""

from __future__ import annotations

import json
from typing import Any

from .jose import b64url, from_b64url, jcs, public_key_from_jwk, verify_es256


def signed_payload(checkout: dict[str, Any]) -> str:
    return jcs({k: v for k, v in checkout.items() if k != "ap2"})


def verify_merchant_authorization(checkout: dict[str, Any], store_keys: list[dict[str, Any]]) -> tuple[bool, str]:
    auth = (checkout.get("ap2") or {}).get("merchant_authorization")
    if not isinstance(auth, str) or ".." not in auth:
        return False, "El checkout no trae la firma de la tienda (merchant_authorization)."
    encoded_header, _, signature = auth.split(".")
    header = json.loads(from_b64url(encoded_header))
    if header.get("alg") != "ES256":
        return False, "Algoritmo de firma no aceptado."
    jwk = next((k for k in store_keys if k.get("kid") == header.get("kid")), None)
    if not jwk:
        return False, "La llave que firmó el checkout no está en el perfil UCP de la tienda."
    signing_input = f"{encoded_header}.{b64url(signed_payload(checkout))}"
    if not verify_es256(signing_input, signature, public_key_from_jwk(jwk)):
        return False, "La firma de la tienda no coincide con los términos del checkout."
    return True, "Firma de la tienda verificada."


def checkout_jwt(checkout: dict[str, Any]) -> str:
    """AP2 `checkout_jwt`: the merchant authorization with its payload attached."""
    header, _, signature = checkout["ap2"]["merchant_authorization"].split(".")
    return f"{header}.{b64url(signed_payload(checkout))}.{signature}"
