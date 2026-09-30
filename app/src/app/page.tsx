// Phone, step 1: the errand. Only the errand and the store list go to the
// agent — no hint about which store is better.
import { storesConfig } from "@/lib/config";
import { ErrandForm } from "@/components/ErrandForm";

export const dynamic = "force-dynamic";

export default function Home() {
  return <ErrandForm stores={storesConfig()} />;
}
