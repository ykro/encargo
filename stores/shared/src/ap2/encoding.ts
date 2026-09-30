// Encoding primitives shared by merchant signatures and mandate verification.
import { createHash } from "node:crypto";

export const b64url = (data: Uint8Array | string): string =>
  Buffer.from(typeof data === "string" ? Buffer.from(data, "utf8") : data).toString("base64url");

export const fromB64url = (s: string): Buffer => Buffer.from(s, "base64url");

/** SD-JWT digest: base64url(sha-256(ascii bytes of the input)). */
export const sha256b64url = (s: string): string => createHash("sha256").update(s, "ascii").digest("base64url");

/**
 * JSON Canonicalization Scheme (RFC 8785) for the data we sign: objects with
 * keys sorted by UTF-16 code units, no whitespace, ES number serialization.
 * Money is always integer cents, so number formatting never diverges between
 * the TypeScript store and the Python agent.
 */
export function jcs(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${jcs(v)}`).join(",")}}`;
}
