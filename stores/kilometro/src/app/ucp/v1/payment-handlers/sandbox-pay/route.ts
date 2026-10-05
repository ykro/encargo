import { sandboxPaySpec } from "@/shared/ucp/sandboxPay";
import { agentReadyOnly } from "@/shared/ucp/http";

export const dynamic = "force-dynamic";
export const GET = agentReadyOnly(async () => sandboxPaySpec());
