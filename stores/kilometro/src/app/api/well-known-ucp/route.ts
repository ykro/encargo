// GET /.well-known/ucp (rewritten here): the store's UCP business profile.
import { businessProfile } from "@/shared/ucp/profile";
import { agentReadyOnly, json } from "@/shared/ucp/http";
import { baseUrlFrom } from "@/shared/store";

export const dynamic = "force-dynamic";

export const GET = agentReadyOnly(async (req: Request) => json(await businessProfile(baseUrlFrom(req.headers))));
