import { NextResponse } from "next/server";

// Browser-side failures (e.g. a passkey ceremony that never completes) are
// invisible to the server otherwise. Log them so Cloud Logging shows why.
export async function POST(req: Request) {
  // Public endpoint: cap what one call can write to the logs.
  const text = (await req.text().catch(() => "")).slice(0, 2000);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const entry = typeof body === "object" && body !== null && !Array.isArray(body) ? body : { raw: String(body) };
  console.warn(JSON.stringify({ severity: "WARNING", event: "client_error", ...entry, ua: req.headers.get("user-agent")?.slice(0, 300) }));
  return NextResponse.json({ ok: true });
}
