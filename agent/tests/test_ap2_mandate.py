"""The mandate the platform signs is an AP2 closed checkout mandate bound to the
exact checkout the store signed."""

import json

from cryptography.hazmat.primitives.asymmetric import ec

from encargo.ap2.jose import b64url, from_b64url, jcs, public_jwk, sha256_b64url, sign_es256, verify_es256, public_key_from_jwk
from encargo.ap2.merchant_signature import checkout_jwt, verify_merchant_authorization
from encargo.ap2.signer import PlatformKey, build_checkout_mandate


def signed_checkout(key, kid="km"):
    checkout = {"id": "chk_1", "status": "ready_for_complete", "currency": "USD", "totals": [{"type": "total", "amount": 14500}], "note": "Kilómetro"}
    header = b64url(json.dumps({"alg": "ES256", "kid": kid}, separators=(",", ":")))
    sig = sign_es256(f"{header}.{b64url(jcs(checkout))}", key)
    return {**checkout, "ap2": {"merchant_authorization": f"{header}..{sig}"}}


def test_merchant_signature_verifies_and_detects_tampering():
    key = ec.generate_private_key(ec.SECP256R1())
    checkout = signed_checkout(key)
    assert verify_merchant_authorization(checkout, [public_jwk(key, "km")])[0]
    tampered = {**checkout, "totals": [{"type": "total", "amount": 100}]}
    assert not verify_merchant_authorization(tampered, [public_jwk(key, "km")])[0]
    other = ec.generate_private_key(ec.SECP256R1())
    assert not verify_merchant_authorization(checkout, [public_jwk(other, "km")])[0]


def test_checkout_mandate_structure():
    merchant = ec.generate_private_key(ec.SECP256R1())
    platform = PlatformKey(ec.generate_private_key(ec.SECP256R1()), "encargo-test")
    checkout = signed_checkout(merchant)
    token = build_checkout_mandate(checkout, audience="https://km.test", issuer="https://encargo.test/.well-known/ucp", key=platform)

    issuer_jwt, mandate_d, jwt_d, tail = token.split("~")
    assert tail == ""
    h, p, s = issuer_jwt.split(".")
    assert verify_es256(f"{h}.{p}", s, public_key_from_jwk(platform.public_jwk))
    header, claims = json.loads(from_b64url(h)), json.loads(from_b64url(p))
    assert header == {"alg": "ES256", "typ": "dc+sd-jwt", "kid": "encargo-test"}
    assert claims["aud"] == "https://km.test" and claims["nonce"] == "chk_1" and claims["_sd_alg"] == "sha-256"
    assert claims["delegate_payload"] == [{"...": sha256_b64url(mandate_d)}]

    _, mandate = json.loads(from_b64url(mandate_d))
    assert mandate["vct"] == "mandate.checkout.1"
    assert mandate["_sd"] == [sha256_b64url(jwt_d)]
    _, name, jwt_value = json.loads(from_b64url(jwt_d))
    assert name == "checkout_jwt" and jwt_value == checkout_jwt(checkout)
    assert mandate["checkout_hash"] == sha256_b64url(jwt_value)
    # The embedded checkout_jwt carries the store's own signature over the checkout.
    ch, cp, cs = jwt_value.split(".")
    assert verify_es256(f"{ch}.{cp}", cs, merchant.public_key())
    assert json.loads(from_b64url(cp))["totals"][0]["amount"] == 14500
