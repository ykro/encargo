// Test-only mirror of the Encargo platform signer (agent/encargo/ap2/signer.py):
// builds an AP2 closed checkout mandate SD-JWT for a signed checkout.
import { CompactSign, exportJWK, generateKeyPair, type JWK } from "jose";
import { b64url, sha256b64url } from "../src/ap2/encoding";
import { checkoutJwtOf, type Checkout } from "../src/ap2/merchantAuthorization";

export const PLATFORM_PROFILE = "https://encargo.test/.well-known/ucp";

export async function platformKeyPair(kid = "encargo-test") {
  const pair = await generateKeyPair("ES256", { extractable: true });
  const pub = { ...(await exportJWK(pair.publicKey)), kid, alg: "ES256", use: "sig" } as JWK;
  return { privateKey: pair.privateKey, publicJwk: pub, kid };
}

export async function makeMandate(opts: {
  checkout: Checkout;
  privateKey: CryptoKey;
  kid: string;
  aud: string;
  exp?: number;
  checkoutJwt?: string;
}): Promise<string> {
  const checkoutJwt = opts.checkoutJwt ?? checkoutJwtOf(opts.checkout);
  const jwtDisclosure = b64url(JSON.stringify(["salt-1", "checkout_jwt", checkoutJwt]));
  const mandateDisclosure = b64url(
    JSON.stringify([
      "salt-2",
      { _sd: [sha256b64url(jwtDisclosure)], vct: "mandate.checkout.1", checkout_hash: sha256b64url(checkoutJwt) },
    ]),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: PLATFORM_PROFILE,
    aud: opts.aud,
    iat: now,
    exp: opts.exp ?? now + 600,
    nonce: opts.checkout.id,
    _sd_alg: "sha-256",
    delegate_payload: [{ "...": sha256b64url(mandateDisclosure) }],
  };
  const jwt = await new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "ES256", typ: "dc+sd-jwt", kid: opts.kid })
    .sign(opts.privateKey);
  return `${jwt}~${mandateDisclosure}~${jwtDisclosure}~`;
}
