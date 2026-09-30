// Which platform keys may sign mandates for this store.
//
// The agent identifies itself with the UCP-Agent header, pointing to its own
// UCP profile (/.well-known/ucp) whose `keys[]` hold the public mandate key.
// The store only fetches profiles it trusts (TRUSTED_PLATFORM_PROFILES): an
// unknown agent cannot bring its own key and approve its own purchases.
import type { JWK } from "jose";

const DEFAULT_TRUSTED = "http://localhost:8000/.well-known/ucp";
const cache = new Map<string, { keys: JWK[]; at: number }>();
const TTL_MS = 60_000;

export function parseUcpAgent(header: string | null): string | undefined {
  const match = header?.match(/profile="([^"]+)"/);
  return match?.[1];
}

export function trustedProfiles(): string[] {
  return (process.env.TRUSTED_PLATFORM_PROFILES ?? DEFAULT_TRUSTED)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function platformKeysFor(
  ucpAgentHeader: string | null,
  fetcher: typeof fetch = fetch,
): Promise<{ keys: JWK[]; profile?: string; error?: string }> {
  const profile = parseUcpAgent(ucpAgentHeader);
  if (!profile) return { keys: [], error: "Falta el encabezado UCP-Agent con el perfil de la plataforma." };
  if (!trustedProfiles().includes(profile)) {
    return { keys: [], profile, error: "La plataforma que firma este mandato no es de confianza para esta tienda." };
  }
  const hit = cache.get(profile);
  if (hit && Date.now() - hit.at < TTL_MS) return { keys: hit.keys, profile };
  try {
    const res = await fetcher(profile, { headers: { accept: "application/json" } });
    const body = (await res.json()) as { keys?: JWK[] };
    const keys = body.keys ?? [];
    cache.set(profile, { keys, at: Date.now() });
    return { keys, profile };
  } catch {
    return { keys: [], profile, error: "No se pudo leer el perfil de la plataforma." };
  }
}

export function clearPlatformKeyCache(): void {
  cache.clear();
}
