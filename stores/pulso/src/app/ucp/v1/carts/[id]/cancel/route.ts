import { cancelCart } from "@/shared/ucp/cartApi";
import { agentReadyOnly } from "@/shared/ucp/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const POST = agentReadyOnly(async (req: Request, ctx: Ctx) => cancelCart(req, (await ctx.params).id));
