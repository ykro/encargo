import { NextResponse } from "next/server";

// Browser-side failures (e.g. a passkey ceremony that never completes) are
// invisible to the server otherwise. Log them so Cloud Logging shows why.
export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* ignore malformed bodies */
  }
  const entry = typeof body === "object" && body !== null ? body : { raw: String(body) };
  console.warn(JSON.stringify({ severity: "WARNING", event: "client_error", ...entry, ua: req.headers.get("user-agent") }));
  return NextResponse.json({ ok: true });
}
