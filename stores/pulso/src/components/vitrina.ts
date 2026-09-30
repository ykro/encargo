// Typed access to the client-side showcase built by scripts/build-vitrina.mjs.
import data from "@/vitrina.json";

export interface VitrinaItem {
  ref: string;
  image: string;
  sizes: { size: string; available: boolean }[];
  deliveryDays: number;
}

export const vitrina = data as { hero: string | null; heroRef: string; items: VitrinaItem[] };
export const findItem = (ref: string | null) => vitrina.items.find((i) => i.ref === ref);
