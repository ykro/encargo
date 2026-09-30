import { catalogSearch } from "@/shared/ucp/catalogApi";
import { agentReadyOnly } from "@/shared/ucp/http";

export const dynamic = "force-dynamic";
export const POST = agentReadyOnly(catalogSearch);
