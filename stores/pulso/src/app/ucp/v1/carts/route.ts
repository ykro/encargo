import { createCart } from "@/shared/ucp/cartApi";
import { agentReadyOnly } from "@/shared/ucp/http";

export const dynamic = "force-dynamic";
export const POST = agentReadyOnly(createCart);
