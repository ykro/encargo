// Which store this process is, and whether it publishes machine-readable data.
//
// Kilómetro is always agent-ready. Pulso is agent-ready only in control mode
// (PULSO_AGENT_READY=true, or flipped at runtime through the admin endpoint so
// the bias test and the stage demo can switch it without a redeploy).

export type StoreKey = "kilometro" | "pulso";

export interface StoreIdentity {
  key: StoreKey;
  name: string;
}

const NAMES: Record<StoreKey, string> = { kilometro: "Kilómetro", pulso: "Pulso" };

export function currentStore(): StoreIdentity {
  const key = (process.env.STORE_KEY ?? "kilometro") as StoreKey;
  if (!(key in NAMES)) throw new Error(`Unknown STORE_KEY: ${key}`);
  return { key, name: NAMES[key] };
}

// Runtime override survives only as long as the process; the env var is the default.
const state = globalThis as unknown as { __agentReadyOverride?: boolean };

export function isAgentReady(): boolean {
  const store = currentStore();
  if (store.key === "kilometro") return true;
  if (state.__agentReadyOverride !== undefined) return state.__agentReadyOverride;
  return process.env.PULSO_AGENT_READY === "true";
}

export function setAgentReady(enabled: boolean): void {
  state.__agentReadyOverride = enabled;
}

/** Public origin of this store as seen by the caller (Cloud Run sits behind a proxy). */
export function baseUrlFrom(headers: Headers): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost";
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0] ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Pulso's product references are opaque tokens, not readable slugs. */
export function pulsoRef(slug: string): string {
  let h = 2166136261;
  for (const c of slug) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}

/** Where a product page lives: Kilómetro uses readable URLs, Pulso opaque ones. */
export function productPath(slug: string): string {
  return currentStore().key === "pulso" ? `/p/${pulsoRef(slug)}` : `/productos/${slug}`;
}

export function requestHost(headers: Headers): string {
  return headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost";
}
