import type { Metadata } from "next";
import { Listing, type ListingParams } from "@/components/Listing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trail" };

export default async function Trail({ searchParams }: { searchParams: Promise<ListingParams> }) {
  return <Listing title="Trail" base="/trail" category="trail" params={await searchParams} />;
}
