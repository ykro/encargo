// Turns requested items ({item: {id}, quantity}) into priced UCP line items.
import { findVariant } from "../db";

export interface LineItemInput {
  item?: { id?: string };
  quantity?: number;
}

export interface PricedLineItem {
  id: string;
  item: { id: string; title: string; price: number };
  quantity: number;
  totals: { type: string; amount: number }[];
}

export type PricingResult =
  | { ok: true; lineItems: PricedLineItem[]; subtotal: number; shipping: { handling: [number, number]; transit: [number, number]; rate: number } }
  | { ok: false; code: string; content: string };

export function priceLineItems(inputs: LineItemInput[] | undefined): PricingResult {
  if (!inputs?.length) return { ok: false, code: "missing", content: "Se necesita al menos un artículo." };
  const lineItems: PricedLineItem[] = [];
  let handling: [number, number] = [0, 0];
  let transit: [number, number] = [0, 0];
  let rate = 0;
  for (const [i, input] of inputs.entries()) {
    const id = input.item?.id ?? "";
    const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
    const found = findVariant(id);
    if (!found) {
      return { ok: false, code: "not_found", content: `El artículo ${id} no existe. Usa el id de una variante (modelo + talla).` };
    }
    if (found.variant.stock < quantity) {
      return { ok: false, code: "out_of_stock", content: `${found.product.name} talla ${found.variant.size} está agotado.` };
    }
    const amount = found.product.priceCents * quantity;
    lineItems.push({
      id: `li_${i + 1}`,
      item: { id, title: `${found.product.name} — talla ${found.variant.size}`, price: found.product.priceCents },
      quantity,
      totals: [
        { type: "subtotal", amount },
        { type: "total", amount },
      ],
    });
    const s = found.product.shipping;
    handling = [Math.max(handling[0], s.handlingDays[0]), Math.max(handling[1], s.handlingDays[1])];
    transit = [Math.max(transit[0], s.transitDays[0]), Math.max(transit[1], s.transitDays[1])];
    rate = Math.max(rate, s.rateCents);
  }
  const subtotal = lineItems.reduce((sum, li) => sum + li.totals[0].amount, 0);
  return { ok: true, lineItems, subtotal, shipping: { handling, transit, rate } };
}
