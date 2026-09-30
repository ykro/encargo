import { storesConfig } from "@/lib/config";
import { RunPhone } from "@/components/RunPhone";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunPhone runId={id} stores={storesConfig()} />;
}
