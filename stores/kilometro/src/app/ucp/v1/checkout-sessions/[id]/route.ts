import { getCheckout, updateCheckout } from "@/shared/ucp/checkoutApi";
import { agentReadyOnly } from "@/shared/ucp/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = agentReadyOnly(async (req: Request, ctx: Ctx) => getCheckout(req, (await ctx.params).id));
export const PUT = agentReadyOnly(async (req: Request, ctx: Ctx) => updateCheckout(req, (await ctx.params).id));
