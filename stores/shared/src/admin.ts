// Demo operations: `make reset` and control mode. Protected by ADMIN_TOKEN so
// nobody in the audience can reset the stores mid-talk.
import { listOrders, resetStore } from "./db";
import { currentStore, isAgentReady, setAgentReady } from "./store";
import { clearPlatformKeyCache } from "./ap2/platformKeys";
import { json, readJson } from "./ucp/http";

function authorized(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN ?? "dev-admin";
  return req.headers.get("authorization") === `Bearer ${token}`;
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
