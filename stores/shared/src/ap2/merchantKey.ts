// The store's signing key. Its public half is published in /.well-known/ucp
// `keys[]` so the agent can check that checkout terms really come from the store.
//
// MERCHANT_SIGNING_JWK (a private EC P-256 JWK) makes the key stable across
// restarts; without it a key is generated per process, which is fine because
// checkouts live in the same process (the store runs as a single instance).
import { calculateJwkThumbprint, exportJWK, generateKeyPair, importJWK, type CryptoKey, type JWK } from "jose";

interface MerchantKey {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

const g = globalThis as unknown as { __merchantKey?: Promise<MerchantKey> };

async function load(): Promise<MerchantKey> {
  let privateJwk: JWK;
  if (process.env.MERCHANT_SIGNING_JWK) {
    privateJwk = JSON.parse(process.env.MERCHANT_SIGNING_JWK) as JWK;
  } else {
    const pair = await generateKeyPair("ES256", { extractable: true });
    privateJwk = await exportJWK(pair.privateKey);
  }
  const { d: _private, ...pub } = privateJwk;
  const kid = privateJwk.kid ?? (await calculateJwkThumbprint(pub));
  const privateKey = (await importJWK({ ...privateJwk, alg: "ES256" }, "ES256")) as CryptoKey;
  return { kid, privateKey, publicJwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, kid, use: "sig", alg: "ES256" } };
}

export function merchantKey(): Promise<MerchantKey> {
  g.__merchantKey ??= load();
  return g.__merchantKey;
}
