import { Listing, type ListingParams } from "@/components/Listing";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<ListingParams> }) {
  return <Listing title="Tenis para correr" base="/" params={await searchParams} />;
}
