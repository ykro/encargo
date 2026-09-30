import { cancelCheckout } from "@/shared/ucp/checkoutApi";
import { agentReadyOnly } from "@/shared/ucp/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const POST = agentReadyOnly(async (req: Request, ctx: Ctx) => cancelCheckout(req, (await ctx.params).id));
