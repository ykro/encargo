// GET /feed.xml: the whole catalog in Merchant Center format.
import { listProducts } from "@/shared/db";
import { merchantFeedXml } from "@/shared/merchantFeed";
import { agentReadyOnly } from "@/shared/ucp/http";
import { baseUrlFrom, currentStore } from "@/shared/store";

export const dynamic = "force-dynamic";

export const GET = agentReadyOnly(
  (req: Request) =>
    new Response(merchantFeedXml(listProducts(), baseUrlFrom(req.headers), currentStore().name), {
      headers: { "content-type": "application/xml; charset=utf-8" },
    }),
);
