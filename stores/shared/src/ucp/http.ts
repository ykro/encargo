// Small HTTP helpers shared by the UCP REST handlers.
import { isAgentReady } from "../store";
import { UCP_VERSION } from "./version";

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...headers },
  });

/** A store that is not agent-ready simply has nothing here — no bot blocking, just nothing to read. */
export const notFound = () => new Response("Not found", { status: 404 });

export function ucpMeta(capabilities: string[]) {
  return {
    version: UCP_VERSION,
    capabilities: Object.fromEntries(capabilities.map((c) => [c, [{ version: UCP_VERSION }]])),
  };
}

export function ucpError(code: string, content: string, status = 200, severity = "unrecoverable") {
  return json(
    { ucp: { version: UCP_VERSION, status: "error" }, messages: [{ type: "error", code, content, severity }] },
    status,
  );
}

export async function readJson<T>(req: Request): Promise<T | undefined> {
  try {
    return (await req.json()) as T;
  } catch {
    return undefined;
  }
}

/** Wraps a handler so it only exists when the store publishes machine-readable data. */
export function agentReadyOnly<A extends unknown[]>(handler: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => (isAgentReady() ? handler(...args) : notFound());
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
