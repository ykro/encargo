import type { Metadata } from "next";
import { Listing, type ListingParams } from "@/components/Listing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ruta" };

export default async function Ruta({ searchParams }: { searchParams: Promise<ListingParams> }) {
  return <Listing title="Ruta" base="/ruta" category="road" params={await searchParams} />;
}
