// UCP checkout capability (REST) with the AP2 Mandates extension always active:
// every checkout response carries the store's merchant_authorization, and
// POST /checkout-sessions/{id}/complete refuses to place an order without a
// checkout mandate signed on the person's behalf by a trusted platform.
import { merchantKey } from "../ap2/merchantKey";
import { signCheckout, type Checkout } from "../ap2/merchantAuthorization";
import { verifyCheckoutMandate } from "../ap2/checkoutMandate";
import { platformKeysFor } from "../ap2/platformKeys";
import { checkoutStatus, checkoutToken, claimCheckout, loadDoc, releaseCheckout, saveDoc, saveOrder, setCheckoutToken, takeStock } from "../db";
import { isAdmin } from "../admin";
import { addBusinessDays, spanishDate, todayInGuatemala } from "../delivery";
import { baseUrlFrom, currentStore, requestHost } from "../store";
import { json, newId, readJson, ucpError, ucpMeta } from "./http";
import { priceLineItems, type LineItemInput, type PricedLineItem } from "./lineItems";
import { CAPABILITIES, SANDBOX_HANDLER, SANDBOX_TOKEN, UCP_VERSION } from "./version";

type StoredCheckout = Checkout & { status: string; line_items: PricedLineItem[] };

const CHECKOUT_CAPS = [CAPABILITIES.checkout, CAPABILITIES.fulfillment, CAPABILITIES.ap2Mandate];

async function buildCheckout(id: string, inputs: LineItemInput[] | undefined, baseUrl: string) {
  const priced = priceLineItems(inputs);
  if (!priced.ok) return priced;
  const today = todayInGuatemala();
  const { handling, transit, rate } = priced.shipping;
  const earliest = addBusinessDays(today, handling[0] + transit[0]);
  const latest = addBusinessDays(today, handling[1] + transit[1]);
  const ids = priced.lineItems.map((li) => li.id);
  const checkout: StoredCheckout = {
    ucp: {
      ...ucpMeta(CHECKOUT_CAPS),
      payment_handlers: {
        [SANDBOX_HANDLER]: [{ id: "sandbox_pay", version: UCP_VERSION, available_instruments: [{ type: "card" }] }],
      },
    },
    id,
    status: "ready_for_complete",
    currency: "USD",
    line_items: priced.lineItems,
    totals: [
      { type: "subtotal", amount: priced.subtotal },
      { type: "fulfillment", amount: rate },
      { type: "total", amount: priced.subtotal + rate },
    ],
    fulfillment: {
      methods: [
        {
          id: "shipping",
          type: "shipping",
          line_item_ids: ids,
          groups: [
            {
              id: "package_1",
              line_item_ids: ids,
              selected_option_id: "standard",
              options: [
                {
                  id: "standard",
                  title: "Envío estándar",
                  description: { plain: `Llega a más tardar el ${spanishDate(latest)}` },
                  earliest_fulfillment_time: earliest.toISOString(),
                  latest_fulfillment_time: latest.toISOString(),
                  totals: [{ type: "total", amount: rate }],
                },
              ],
            },
          ],
        },
      ],
    },
    links: [{ type: "terms_of_service", url: `${baseUrl}/terminos` }],
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  return { ok: true as const, checkout: await signCheckout(checkout) };
}

export async function createCheckout(req: Request): Promise<Response> {
  const body = await readJson<{ line_items?: LineItemInput[]; cart_id?: string }>(req);
  let inputs = body?.line_items;
  if (!inputs && body?.cart_id) {
    const cart = loadDoc<{ line_items: PricedLineItem[] }>("carts", body.cart_id);
    if (!cart) return ucpError("not_found", "Carrito no encontrado.", 404);
    inputs = cart.line_items.map((li) => ({ item: { id: li.item.id }, quantity: li.quantity }));
  }
  const built = await buildCheckout(newId("chk"), inputs, baseUrlFrom(req.headers));
  if (!built.ok) return ucpError(built.code, built.content);
  saveDoc("checkouts", built.checkout.id, built.checkout, built.checkout.status);
  const token = crypto.randomUUID().replace(/-/g, "");
  setCheckoutToken(built.checkout.id, token);
  // The checkout's key: needed to update or cancel it (completing needs the mandate instead).
  return json(built.checkout, 201, { "ucp-checkout-token": token, "access-control-expose-headers": "ucp-checkout-token" });
}

export async function getCheckout(_req: Request, id: string): Promise<Response> {
  const checkout = loadDoc<StoredCheckout>("checkouts", id);
  return checkout ? json(checkout) : ucpError("not_found", "Checkout no encontrado.", 404);
}

/** Only the checkout's creator (its key) or the store admin may change or cancel it. */
function mayModify(req: Request, id: string): boolean {
  const token = checkoutToken(id);
  return isAdmin(req) || (Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`);
}

export async function updateCheckout(req: Request, id: string): Promise<Response> {
  const existing = loadDoc<StoredCheckout>("checkouts", id);
  if (!existing) return ucpError("not_found", "Checkout no encontrado.", 404);
  if (!mayModify(req, id)) return ucpError("unauthorized", "Falta la llave de este checkout.", 401);
  if (checkoutStatus(id) !== "ready_for_complete") return ucpError("invalid_state", "Este checkout ya no se puede cambiar.", 409);
  if (existing.status === "completed" || existing.status === "canceled") {
    return ucpError("invalid_state", "Este checkout ya está cerrado.", 409);
  }
  const body = await readJson<{ line_items?: LineItemInput[] }>(req);
  const built = await buildCheckout(id, body?.line_items, baseUrlFrom(req.headers));
  if (!built.ok) return ucpError(built.code, built.content);
  saveDoc("checkouts", id, built.checkout, built.checkout.status);
  return json(built.checkout);
}

export async function cancelCheckout(req: Request, id: string): Promise<Response> {
  const existing = loadDoc<StoredCheckout>("checkouts", id);
  if (!existing) return ucpError("not_found", "Checkout no encontrado.", 404);
  if (!mayModify(req, id)) return ucpError("unauthorized", "Falta la llave de este checkout.", 401);
  if (checkoutStatus(id) !== "ready_for_complete") return ucpError("invalid_state", "Este checkout ya está cerrado o en pago.", 409);
  const canceled = await signCheckout({ ...existing, status: "canceled" });
  saveDoc("checkouts", id, canceled, "canceled");
  return json(canceled);
}

interface CompleteRequest {
  payment?: { instruments?: { handler_id?: string; credential?: { token?: string } }[] };
  ap2?: { checkout_mandate?: string };
}

export async function completeCheckout(req: Request, id: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const checkout = loadDoc<StoredCheckout>("checkouts", id);
  if (!checkout) return ucpError("not_found", "Checkout no encontrado.", 404);
  if (Date.parse(String(checkout.expires_at)) < Date.now()) return ucpError("expired", "El checkout expiró.", 409);
  // Claim before the first await: a second concurrent /complete finds it taken.
  if (!claimCheckout(id)) {
    return ucpError("invalid_state", `El checkout está en estado ${checkoutStatus(id) ?? "desconocido"}.`, 409);
  }
  const refuse = (r: Response) => {
    releaseCheckout(id);
    return r;
  };
  const body = (await readJson<CompleteRequest>(req)) ?? {};

  // The person's authorization comes first: without a valid mandate nothing else is looked at.
  const platform = await platformKeysFor(req.headers.get("ucp-agent"), fetcher);
  if (platform.error && body.ap2?.checkout_mandate) return refuse(ucpError("mandate_signature", platform.error, 403));
  const check = await verifyCheckoutMandate({
    mandate: body.ap2?.checkout_mandate,
    checkout,
    platformKeys: platform.keys,
    merchantPublicJwk: (await merchantKey()).publicJwk,
    audienceHost: requestHost(req.headers),
  });
  if (!check.ok) return refuse(ucpError(check.code!, check.reason!, 403));

  const instrument = body.payment?.instruments?.[0];
  if (instrument?.handler_id !== "sandbox_pay" || instrument.credential?.token !== SANDBOX_TOKEN) {
    return refuse(ucpError("payment_declined", "Instrumento de pago no aceptado (solo sandbox).", 402));
  }

  for (const li of checkout.line_items) {
    if (!takeStock(li.item.id, li.quantity)) {
      return refuse(ucpError("out_of_stock", `${li.item.title} se agotó mientras se aprobaba el pago.`, 409));
    }
  }

  const orderId = newId("ord");
  const baseUrl = baseUrlFrom(req.headers);
  const completed = await signCheckout({
    ...checkout,
    status: "completed",
    order: { id: orderId, label: `Pedido ${orderId.slice(-6).toUpperCase()}`, permalink_url: `${baseUrl}/pedidos/${orderId}` },
  });
  saveDoc("checkouts", id, completed, "completed");
  saveOrder(orderId, id, {
    id: orderId,
    store: currentStore().key,
    checkout_id: id,
    line_items: checkout.line_items,
    totals: checkout.totals,
    mandate: { vct: check.claims?.vct, checkout_hash: check.claims?.checkout_hash, platform: platform.profile },
    created_at: new Date().toISOString(),
  });
  return json(completed);
}
