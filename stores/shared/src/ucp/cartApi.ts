// UCP cart capability (REST): POST /carts, GET|PUT /carts/{id}, POST /carts/{id}/cancel.
import { loadDoc, saveDoc } from "../db";
import { baseUrlFrom } from "../store";
import { json, newId, readJson, ucpError, ucpMeta } from "./http";
import { priceLineItems, type LineItemInput } from "./lineItems";
import { CAPABILITIES } from "./version";

type Cart = Record<string, unknown> & { id: string; status?: string };

function buildCart(id: string, inputs: LineItemInput[] | undefined, baseUrl: string): Cart | Response {
  const priced = priceLineItems(inputs);
  if (!priced.ok) return ucpError(priced.code, priced.content);
  return {
    ucp: ucpMeta([CAPABILITIES.checkout, CAPABILITIES.cart]),
    id,
    line_items: priced.lineItems,
    currency: "USD",
    totals: [
      { type: "subtotal", amount: priced.subtotal },
      { type: "total", amount: priced.subtotal, display_text: "Total estimado (envío calculado en el checkout)" },
    ],
    continue_url: `${baseUrl}/carrito?cart=${id}`,
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
  };
}

export async function createCart(req: Request): Promise<Response> {
  const body = await readJson<{ line_items?: LineItemInput[] }>(req);
  const cart = buildCart(newId("cart"), body?.line_items, baseUrlFrom(req.headers));
  if (cart instanceof Response) return cart;
  saveDoc("carts", cart.id, cart);
  return json(cart, 201);
}

export async function getCart(_req: Request, id: string): Promise<Response> {
  const cart = loadDoc<Cart>("carts", id);
  return cart ? json(cart) : ucpError("not_found", "Carrito no encontrado.", 404);
}

export async function updateCart(req: Request, id: string): Promise<Response> {
  if (!loadDoc<Cart>("carts", id)) return ucpError("not_found", "Carrito no encontrado.", 404);
  const body = await readJson<{ line_items?: LineItemInput[] }>(req);
  const cart = buildCart(id, body?.line_items, baseUrlFrom(req.headers));
  if (cart instanceof Response) return cart;
  saveDoc("carts", id, cart);
  return json(cart);
}

export async function cancelCart(_req: Request, id: string): Promise<Response> {
  const cart = loadDoc<Cart>("carts", id);
  if (!cart) return ucpError("not_found", "Carrito no encontrado.", 404);
  const canceled = { ...cart, status: "canceled" };
  saveDoc("carts", id, canceled);
  return json(canceled);
}
