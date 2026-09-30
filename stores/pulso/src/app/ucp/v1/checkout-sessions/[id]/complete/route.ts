// POST /ucp/v1/checkout-sessions/{id}/complete — places the order only with a
// valid AP2 checkout mandate (see shared/ap2/checkoutMandate.ts).
import { completeCheckout } from "@/shared/ucp/checkoutApi";
import { agentReadyOnly } from "@/shared/ucp/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const POST = agentReadyOnly(async (req: Request, ctx: Ctx) => completeCheckout(req, (await ctx.params).id));
