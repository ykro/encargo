// Is Pulso in control mode (publishing the same machine-readable data)? The
// presenter shows it so the audience knows which experiment is running.
import { storesConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const pulso = storesConfig().find((s) => s.key === "pulso")!;
  try {
    const res = await fetch(`${pulso.url}/api/admin/agent-ready`, { cache: "no-store" });
    const body = (await res.json()) as { agent_ready?: boolean };
    return Response.json({ pulsoAgentReady: Boolean(body.agent_ready) });
  } catch {
    return Response.json({ pulsoAgentReady: null });
  }
}
