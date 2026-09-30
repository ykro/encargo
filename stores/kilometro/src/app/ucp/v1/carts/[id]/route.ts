import { getCart, updateCart } from "@/shared/ucp/cartApi";
import { agentReadyOnly } from "@/shared/ucp/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = agentReadyOnly(async (req: Request, ctx: Ctx) => getCart(req, (await ctx.params).id));
export const PUT = agentReadyOnly(async (req: Request, ctx: Ctx) => updateCart(req, (await ctx.params).id));
