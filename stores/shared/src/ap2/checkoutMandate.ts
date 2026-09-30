// Verifies the AP2 closed Checkout Mandate (vct "mandate.checkout.1") that the
// agent must present to complete a checkout. No valid mandate, no order.
//
// Format: SD-JWT  <issuer-jwt>~<mandate disclosure>~<checkout_jwt disclosure>~
//   issuer-jwt payload: { iss, aud, iat, exp, nonce, _sd_alg: "sha-256",
//                         delegate_payload: [{ "...": digest(mandate disclosure) }] }
//   mandate disclosure:  [salt, { vct, checkout_hash, _sd: [digest(checkout_jwt disclosure)] }]
//   checkout_jwt disclosure: [salt, "checkout_jwt", <merchant-signed checkout JWT>]
// Signed by the Encargo platform key (trusted platform provider model of the
// UCP AP2 Mandates extension) only after the person approves.
import { compactVerify, decodeProtectedHeader, importJWK, type JWK } from "jose";
import { fromB64url, jcs, sha256b64url } from "./encoding";
import { signedPayload, verifyOwnCheckoutJwt, type Checkout } from "./merchantAuthorization";

export const CHECKOUT_MANDATE_VCT = "mandate.checkout.1";

export interface MandateCheck {
  ok: boolean;
  code?: "mandate_missing" | "mandate_malformed" | "mandate_signature" | "mandate_expired" | "mandate_mismatch" | "mandate_audience";
  reason?: string;
  claims?: Record<string, unknown>;
}

const fail = (code: MandateCheck["code"], reason: string): MandateCheck => ({ ok: false, code, reason });

function decodeDisclosure(d: string): unknown[] {
  const value = JSON.parse(fromB64url(d).toString("utf8"));
  if (!Array.isArray(value)) throw new Error("disclosure is not an array");
  return value;
}

export async function verifyCheckoutMandate(args: {
  mandate: unknown;
  checkout: Checkout; // the checkout as stored by the store (with its ap2 field)
  platformKeys: JWK[];
  merchantPublicJwk: JWK;
  audienceHost: string;
  now?: number;
}): Promise<MandateCheck> {
  const { mandate, checkout, platformKeys, merchantPublicJwk, audienceHost } = args;
  const now = args.now ?? Math.floor(Date.now() / 1000);
  if (typeof mandate !== "string" || mandate.length === 0) {
    return fail("mandate_missing", "Falta ap2.checkout_mandate: la persona no ha firmado este pago.");
  }

  const parts = mandate.split("~");
  if (parts.length < 3) return fail("mandate_malformed", "El mandato no es un SD-JWT válido.");
  const [issuerJwt, ...rest] = parts;
  const disclosures = rest.filter((d) => d.length > 0);

  // 1. Signed by a platform key this store trusts.
  let claims: Record<string, unknown>;
  try {
    const { kid } = decodeProtectedHeader(issuerJwt);
    const jwk = platformKeys.find((k) => k.kid === kid);
    if (!jwk) return fail("mandate_signature", "El mandato está firmado con una llave desconocida.");
    const { payload, protectedHeader } = await compactVerify(issuerJwt, await importJWK(jwk, "ES256"));
    if (protectedHeader.alg !== "ES256") return fail("mandate_signature", "Algoritmo de firma no aceptado.");
    claims = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return fail("mandate_signature", "La firma del mandato no es válida.");
  }

  // 2. Fresh and addressed to this store.
  if (typeof claims.exp !== "number" || claims.exp < now) return fail("mandate_expired", "El mandato expiró.");
  if (typeof claims.aud !== "string" || safeHost(claims.aud) !== audienceHost) {
    return fail("mandate_audience", "El mandato no está dirigido a esta tienda.");
  }

  // 3. Disclosures chain back to the signed payload.
  try {
    const byDigest = new Map(disclosures.map((d) => [sha256b64url(d), d]));
    const delegate = (claims.delegate_payload as { "...": string }[] | undefined)?.[0]?.["..."];
    const mandateDisclosure = delegate ? byDigest.get(delegate) : undefined;
    if (!mandateDisclosure) return fail("mandate_malformed", "Falta la divulgación del mandato.");
    const [, mandateBody] = decodeDisclosure(mandateDisclosure) as [string, Record<string, unknown>];
    if (mandateBody.vct !== CHECKOUT_MANDATE_VCT) return fail("mandate_malformed", "Tipo de mandato incorrecto.");

    const jwtDigest = (mandateBody._sd as string[] | undefined)?.find((d) => byDigest.has(d));
    if (!jwtDigest) return fail("mandate_malformed", "Falta el checkout_jwt en el mandato.");
    const [, name, checkoutJwt] = decodeDisclosure(byDigest.get(jwtDigest)!) as [string, string, string];
    if (name !== "checkout_jwt" || typeof checkoutJwt !== "string") {
      return fail("mandate_malformed", "Divulgación checkout_jwt inválida.");
    }
    if (sha256b64url(checkoutJwt) !== mandateBody.checkout_hash) {
      return fail("mandate_mismatch", "checkout_hash no coincide con el checkout firmado.");
    }

    // 4. The approved checkout is exactly this checkout, as this store signed it.
    const approved = await verifyOwnCheckoutJwt(checkoutJwt, merchantPublicJwk);
    if (jcs(approved) !== signedPayload(checkout)) {
      return fail("mandate_mismatch", "El mandato aprueba otros términos (precio, artículos o checkout distinto).");
    }
    return { ok: true, claims: { ...claims, vct: mandateBody.vct, checkout_hash: mandateBody.checkout_hash } };
  } catch (e) {
    return fail("mandate_malformed", `Mandato ilegible: ${(e as Error).message}`);
  }
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
