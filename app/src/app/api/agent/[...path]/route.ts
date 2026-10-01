// Same-origin proxy to the agent service: the phone and the presenter talk only
// to this app (one origin for passkeys, no CORS), including the SSE stream.
import { agentUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

const ALLOWED = /^(runs(\/[\w-]+(\/events)?)?|mandates\/[\w-]+(\/(sign|reject|passkey-options))?|passkeys\/(status|register\/(options|verify)|[\w-]+)|stage\/session|audit|screenshots\/[\w-]+\.jpg)$/;

async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const path = (await ctx.params).path.join("/");
  if (!ALLOWED.test(path)) return Response.json({ detail: "No encontrado." }, { status: 404 });
  const url = new URL(req.url);
  const headers: Record<string, string> = { accept: req.headers.get("accept") ?? "*/*" };
  for (const h of ["content-type", "authorization", "last-event-id"]) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  try {
    const upstream = await fetch(`${agentUrl()}/${path}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
      cache: "no-store",
      signal: req.signal,
    });
    const out = new Headers();
    for (const h of ["content-type", "cache-control"]) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    if (out.get("content-type")?.includes("event-stream")) out.set("x-accel-buffering", "no");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ detail: "El agente no responde. Revisa que esté en línea." }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const DELETE = forward;
