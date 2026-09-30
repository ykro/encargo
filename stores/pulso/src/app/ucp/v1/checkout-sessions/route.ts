import { createCheckout } from "@/shared/ucp/checkoutApi";
import { agentReadyOnly } from "@/shared/ucp/http";

export const dynamic = "force-dynamic";
export const POST = agentReadyOnly(createCheckout);
