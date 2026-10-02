// Demo operations: `make reset` and control mode. Protected by ADMIN_TOKEN so
// nobody in the audience can reset the stores mid-talk.
import { listOrders, resetStore, stockOf } from "./db";
import { currentStore, isAgentReady, setAgentReady } from "./store";
import { clearPlatformKeyCache } from "./ap2/platformKeys";
import { json, readJson } from "./ucp/http";

/** The store key. Fails closed: the "dev-admin" fallback exists only outside production. */
export function adminToken(): string | undefined {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  return process.env.NODE_ENV === "production" ? undefined : "dev-admin";
}

export function isAdmin(req: Request): boolean {
  const token = adminToken();
  return Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`;
}

function authorized(req: Request): boolean {
  return isAdmin(req);
}

export async function adminReset(req: Request): Promise<Response> {
  if (!authorized(req)) return json({ error: "No autorizado" }, 401);
  resetStore();
  clearPlatformKeyCache();
  return json({ store: currentStore().key, reset: true });
}

export async function adminAgentReady(req: Request): Promise<Response> {
  if (req.method === "GET") return json({ store: currentStore().key, agent_ready: isAgentReady() });
  if (!authorized(req)) return json({ error: "No autorizado" }, 401);
  if (currentStore().key !== "pulso") return json({ error: "Solo Pulso tiene modo de control" }, 400);
  const body = await readJson<{ enabled?: boolean }>(req);
  setAgentReady(Boolean(body?.enabled));
  return json({ store: "pulso", agent_ready: isAgentReady() });
}

export async function adminOrders(req: Request): Promise<Response> {
  if (!authorized(req)) return json({ error: "No autorizado" }, 401);
  return json({ store: currentStore().key, orders: listOrders() });
}

/** GET ?variant=SND-001-9 → units in stock (`make preflight` checks the errand's size 9). */
export async function adminStock(req: Request): Promise<Response> {
  if (!authorized(req)) return json({ error: "No autorizado" }, 401);
  const variant = new URL(req.url).searchParams.get("variant") ?? "";
  return json({ store: currentStore().key, variant, qty: stockOf(variant) });
}
