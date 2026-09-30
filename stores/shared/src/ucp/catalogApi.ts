// UCP catalog capability (REST): POST /catalog/search and POST /catalog/lookup.
// Prices are integer minor units (cents), as the UCP schemas require.
import type { Product } from "../catalog";
import { listProducts } from "../db";
import { baseUrlFrom, productPath } from "../store";
import { json, readJson, ucpMeta } from "./http";
import { CAPABILITIES } from "./version";

export function toUcpProduct(p: Product, baseUrl: string) {
  const money = { amount: p.priceCents, currency: p.currency };
  return {
    id: p.id,
    handle: p.slug,
    title: p.name,
    description: { plain: p.description },
    url: `${baseUrl}${productPath(p.slug)}`,
    categories: [
      { value: "187", taxonomy: "google_product_category" },
      { value: `Calzado > Tenis > ${p.categoryLabel}`, taxonomy: "merchant" },
    ],
    price_range: { min: money, max: money },
    media: [{ type: "image", url: `${baseUrl}${p.image}`, alt_text: p.name }],
    options: [{ name: "Talla", values: p.variants.map((v) => ({ label: v.size })) }],
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: `Talla ${v.size}`,
      price: money,
      availability: { available: v.stock > 0 },
      options: [{ name: "Talla", label: v.size }],
      tags: [p.category],
    })),
    metadata: {
      terrain: p.category,
      brand: p.brand,
      shipping: {
        country: p.shipping.country,
        rate: { amount: p.shipping.rateCents, currency: p.currency },
        handling_business_days: { min: p.shipping.handlingDays[0], max: p.shipping.handlingDays[1] },
        transit_business_days: { min: p.shipping.transitDays[0], max: p.shipping.transitDays[1] },
      },
    },
  };
}

interface SearchRequest {
  query?: string;
  filters?: { categories?: string[]; price?: { min?: number; max?: number } };
  pagination?: { limit?: number };
}

function matches(p: Product, req: SearchRequest): boolean {
  const haystack = `${p.name} ${p.description} ${p.category} ${p.categoryLabel} ${p.brand}`.toLowerCase();
  const terms = (req.query ?? "").toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length && !terms.some((t) => haystack.includes(t))) return false;
  const cats = req.filters?.categories?.map((c) => c.toLowerCase());
  if (cats?.length && !cats.some((c) => haystack.includes(c))) return false;
  const price = req.filters?.price;
  if (price?.max !== undefined && p.priceCents > price.max) return false;
  if (price?.min !== undefined && p.priceCents < price.min) return false;
  return true;
}

export async function catalogSearch(req: Request): Promise<Response> {
  const body = (await readJson<SearchRequest>(req)) ?? {};
  const baseUrl = baseUrlFrom(req.headers);
  const found = listProducts().filter((p) => matches(p, body));
  const limit = Math.min(body.pagination?.limit ?? 20, 50);
  return json({
    ucp: ucpMeta([CAPABILITIES.catalogSearch]),
    products: found.slice(0, limit).map((p) => toUcpProduct(p, baseUrl)),
    pagination: { has_next_page: found.length > limit, total_count: found.length },
  });
}

export async function catalogLookup(req: Request): Promise<Response> {
  const body = (await readJson<{ ids?: string[] }>(req)) ?? {};
  const baseUrl = baseUrlFrom(req.headers);
  const ids = body.ids ?? [];
  const products = listProducts().filter(
    (p) => ids.includes(p.id) || ids.includes(p.slug) || p.variants.some((v) => ids.includes(v.id) || ids.includes(v.sku)),
  );
  const missing = ids.filter(
    (id) => !products.some((p) => p.id === id || p.slug === id || p.variants.some((v) => v.id === id || v.sku === id)),
  );
  return json({
    ucp: ucpMeta([CAPABILITIES.catalogLookup]),
    products: products.map((p) => toUcpProduct(p, baseUrl)),
    ...(missing.length
      ? { messages: missing.map((id) => ({ type: "info", code: "not_found", content: `No encontrado: ${id}` })) }
      : {}),
  });
}
