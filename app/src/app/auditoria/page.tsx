import { storesConfig } from "@/lib/config";
import { AuditView } from "@/components/AuditView";

export const dynamic = "force-dynamic";

export default function Audit() {
  return <AuditView stores={storesConfig()} />;
}
