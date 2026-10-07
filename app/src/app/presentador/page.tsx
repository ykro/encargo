// Presenter view (1920×1080): what a person sees · the agent's reasoning · what the agent sees.
import type { Metadata } from "next";
import { storesConfig } from "@/lib/config";
import { Presenter } from "@/components/Presenter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Encargo · Presentador" };

export default function PresenterPage() {
  return <Presenter stores={storesConfig()} appHost={process.env.APP_PUBLIC_HOST ?? ""} />;
}
