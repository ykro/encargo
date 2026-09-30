import type { StoreRef } from "./config";

export function storeName(stores: StoreRef[], url: string | undefined): string {
  if (!url) return "";
  try {
    const host = new URL(url).host;
    return stores.find((s) => new URL(s.url).host === host)?.name ?? host;
  } catch {
    return url;
  }
}

/** "Senda Acatenango T3 — talla 9 x1" → { product, size } */
export function parseItem(item: string | undefined): { product: string; size: string } {
  const m = item?.match(/^(.*) — talla (\S+?)(?: x\d+)?$/);
  return m ? { product: m[1], size: m[2] } : { product: item ?? "", size: "" };
}
