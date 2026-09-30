// Merchant authorization (UCP AP2 Mandates extension): the store signs every
// checkout it returns, so the terms the person approves are provably the
// store's terms. Detached JWS (RFC 7515 App. F) over JCS(checkout without "ap2").
import { CompactSign, compactVerify, importJWK, type JWK } from "jose";
import { b64url, jcs } from "./encoding";
import { merchantKey } from "./merchantKey";

export type Checkout = Record<string, unknown> & { id: string; ap2?: Record<string, unknown> };

export function signedPayload(checkout: Checkout): string {
  const { ap2: _excluded, ...payload } = checkout;
  return jcs(payload);
}

export async function signCheckout<T extends Checkout>(checkout: T): Promise<T> {
  const key = await merchantKey();
  const compact = await new CompactSign(new TextEncoder().encode(signedPayload(checkout)))
    .setProtectedHeader({ alg: "ES256", kid: key.kid })
    .sign(key.privateKey);
  const [header, , signature] = compact.split(".");
  return { ...checkout, ap2: { ...(checkout.ap2 ?? {}), merchant_authorization: `${header}..${signature}` } };
}

/**
 * The AP2 `checkout_jwt`: the merchant authorization with its payload attached.
 * It is what the person's mandate hashes and embeds.
 */
export function checkoutJwtOf(checkout: Checkout): string {
  const auth = checkout.ap2?.merchant_authorization;
  if (typeof auth !== "string") throw new Error("checkout has no merchant_authorization");
  const [header, , signature] = auth.split(".");
  return `${header}.${b64url(signedPayload(checkout))}.${signature}`;
}

/** Verifies a checkout_jwt was signed by this store; returns the checkout payload. */
export async function verifyOwnCheckoutJwt(jwt: string, publicJwk: JWK): Promise<Record<string, unknown>> {
  const key = await importJWK(publicJwk, "ES256");
  const { payload, protectedHeader } = await compactVerify(jwt, key);
  if (protectedHeader.alg !== "ES256" || protectedHeader.kid !== publicJwk.kid) {
    throw new Error("checkout_jwt no fue firmado con la llave de esta tienda");
  }
  return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
}
