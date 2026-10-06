"""Passkeys: how the person's approval becomes provable.

The phone signs a WebAuthn challenge that is *derived from the checkout the
store signed*: challenge = sha256(checkout_hash + "." + nonce). A valid
assertion therefore proves that the person, with their device and biometrics,
approved exactly this cart — and only then does the platform issue the AP2
mandate. The agent has no tool that reaches this module.

Registration requires the admin (setup) token, so nobody in the audience can
enroll their own phone and approve purchases.
"""

from __future__ import annotations

import hashlib
import secrets
import time
from typing import Any

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from .ap2.jose import sha256_b64url
from .ap2.merchant_signature import checkout_jwt
from .config import settings
from .runstore import RunStore

CHALLENGE_TTL_S = 300


class PasskeyError(Exception):
    pass


def checkout_hash(checkout: dict[str, Any]) -> str:
    """AP2 checkout_hash: base64url(sha-256(checkout_jwt))."""
    return sha256_b64url(checkout_jwt(checkout))


def mandate_challenge(hash_: str, nonce: str) -> bytes:
    return hashlib.sha256(f"{hash_}.{nonce}".encode()).digest()


async def registration_options(store: RunStore, label: str) -> dict[str, Any]:
    s = settings()
    existing = await store.list_passkeys()
    options = generate_registration_options(
        rp_id=s.passkey_rp_id,
        rp_name="Encargo",
        user_name="persona",
        user_display_name=label or "Persona que hace el encargo",
        user_id=b"encargo-persona",
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED, user_verification=UserVerificationRequirement.REQUIRED
        ),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(p["id"])) for p in existing],
    )
    flow_id = f"reg_{secrets.token_hex(8)}"
    await store.save_challenge(
        flow_id, {"kind": "register", "challenge": bytes_to_base64url(options.challenge), "label": label, "at": time.time()}
    )
    return {"flow_id": flow_id, "options": options_to_json(options)}


async def verify_registration(store: RunStore, flow_id: str, credential: dict[str, Any]) -> dict[str, Any]:
    s = settings()
    flow = await store.pop_challenge(flow_id)
    if not flow or flow.get("kind") != "register" or time.time() - flow["at"] > CHALLENGE_TTL_S:
        raise PasskeyError("El registro expiró; vuelve a intentarlo.")
    try:
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(flow["challenge"]),
            expected_rp_id=s.passkey_rp_id,
            expected_origin=s.passkey_origin,
            require_user_verification=True,
        )
    except Exception as e:  # noqa: BLE001 — any verification failure means "not registered"
        raise PasskeyError(f"No se pudo verificar la passkey: {e}") from e
    passkey = {
        "id": bytes_to_base64url(verified.credential_id),
        "public_key": bytes_to_base64url(verified.credential_public_key),
        "sign_count": verified.sign_count,
        "label": flow.get("label") or "Teléfono",
        "rp_id": s.passkey_rp_id,
        "created_at": time.time(),
    }
    await store.save_passkey(passkey)
    return {"id": passkey["id"], "label": passkey["label"]}


async def signing_options(store: RunStore, mandate: dict[str, Any]) -> dict[str, Any]:
    s = settings()
    passkeys = [p for p in await store.list_passkeys() if p.get("rp_id") == s.passkey_rp_id]
    if not passkeys:
        raise PasskeyError("No hay ninguna passkey registrada para aprobar pagos.")
    hash_ = checkout_hash(mandate["checkout"])
    nonce = secrets.token_urlsafe(16)
    options = generate_authentication_options(
        rp_id=s.passkey_rp_id,
        challenge=mandate_challenge(hash_, nonce),
        allow_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(p["id"])) for p in passkeys],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    flow_id = f"sig_{secrets.token_hex(8)}"
    await store.save_challenge(
        flow_id, {"kind": "sign", "mandate_id": mandate["id"], "checkout_hash": hash_, "nonce": nonce, "at": time.time()}
    )
    return {"flow_id": flow_id, "options": options_to_json(options), "checkout_hash": hash_}


async def verify_signature(store: RunStore, mandate: dict[str, Any], flow_id: str, credential: dict[str, Any]) -> dict[str, Any]:
    """Returns the approval evidence stored with the mandate, or raises PasskeyError."""
    s = settings()
    flow = await store.pop_challenge(flow_id)
    if not flow or flow.get("kind") != "sign" or flow.get("mandate_id") != mandate["id"]:
        raise PasskeyError("La solicitud de firma no corresponde a este pago.")
    if time.time() - flow["at"] > CHALLENGE_TTL_S:
        raise PasskeyError("La solicitud de firma expiró.")
    hash_ = checkout_hash(mandate["checkout"])
    if hash_ != flow["checkout_hash"]:
        raise PasskeyError("El carrito cambió después de pedir la firma.")
    passkey = next((p for p in await store.list_passkeys() if p["id"] == credential.get("id")), None)
    if not passkey:
        raise PasskeyError("Esta passkey no está registrada.")
    try:
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=mandate_challenge(hash_, flow["nonce"]),
            expected_rp_id=s.passkey_rp_id,
            expected_origin=s.passkey_origin,
            credential_public_key=base64url_to_bytes(passkey["public_key"]),
            credential_current_sign_count=passkey.get("sign_count", 0),
            require_user_verification=True,
        )
    except Exception as e:  # noqa: BLE001
        raise PasskeyError(f"La firma con passkey no es válida: {e}") from e
    await store.update_passkey(passkey["id"], {"sign_count": verified.new_sign_count, "last_used_at": time.time()})
    return {
        "method": "passkey",
        "credential_id": passkey["id"],
        "label": passkey.get("label"),
        "user_verified": verified.user_verified,
        "checkout_hash": hash_,
        "nonce": flow["nonce"],
    }


async def session_options(store: RunStore) -> dict[str, Any]:
    """Enabling a device on stage: a fresh challenge any registered passkey can sign.

    Whoever holds a registered passkey (Touch ID on the presenter's laptop) can enable
    that browser to start errands, with no setup code to type on the day."""
    s = settings()
    passkeys = [p for p in await store.list_passkeys() if p.get("rp_id") == s.passkey_rp_id]
    if not passkeys:
        raise PasskeyError("No hay ninguna passkey registrada.")
    challenge = secrets.token_bytes(32)
    options = generate_authentication_options(
        rp_id=s.passkey_rp_id,
        challenge=challenge,
        allow_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(p["id"])) for p in passkeys],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    flow_id = f"ses_{secrets.token_hex(8)}"
    await store.save_challenge(flow_id, {"kind": "session", "challenge": bytes_to_base64url(challenge), "at": time.time()})
    return {"flow_id": flow_id, "options": options_to_json(options)}


async def verify_session(store: RunStore, flow_id: str, credential: dict[str, Any]) -> dict[str, Any]:
    s = settings()
    flow = await store.pop_challenge(flow_id)
    if not flow or flow.get("kind") != "session":
        raise PasskeyError("La solicitud no corresponde a este dispositivo.")
    if time.time() - flow["at"] > CHALLENGE_TTL_S:
        raise PasskeyError("La solicitud expiró. Intenta de nuevo.")
    passkey = next((p for p in await store.list_passkeys() if p["id"] == credential.get("id")), None)
    if not passkey:
        raise PasskeyError("Esta passkey no está registrada.")
    try:
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(flow["challenge"]),
            expected_rp_id=s.passkey_rp_id,
            expected_origin=s.passkey_origin,
            credential_public_key=base64url_to_bytes(passkey["public_key"]),
            credential_current_sign_count=passkey.get("sign_count", 0),
            require_user_verification=True,
        )
    except Exception as e:  # noqa: BLE001
        raise PasskeyError(f"La passkey no es válida: {e}") from e
    await store.update_passkey(passkey["id"], {"sign_count": verified.new_sign_count, "last_used_at": time.time()})
    return {"label": passkey.get("label")}
