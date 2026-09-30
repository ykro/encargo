// The trust rule of the talk: no order is placed without a checkout mandate
// signed on the person's behalf, bound to exactly the terms the store signed.
import { beforeEach, describe, expect, it } from "vitest";
import { completeCheckout, createCheckout } from "../src/ucp/checkoutApi";
import { resetStore, stockOf, listOrders } from "../src/db";
import { clearPlatformKeyCache } from "../src/ap2/platformKeys";
import { makeMandate, platformKeyPair, PLATFORM_PROFILE } from "./mandateHelper";
import type { Checkout } from "../src/ap2/merchantAuthorization";
import { SANDBOX_TOKEN } from "../src/ucp/version";

const HOST = "kilometro.test";
const VARIANT = "SND-001-9";

const headers = { host: HOST, "content-type": "application/json", "ucp-agent": `profile="${PLATFORM_PROFILE}"` };

async function newCheckout(): Promise<Checkout> {
  const res = await createCheckout(
    new Request(`http://${HOST}/ucp/v1/checkout-sessions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ line_items: [{ item: { id: VARIANT }, quantity: 1 }] }),
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as Checkout;
}

const payment = { instruments: [{ id: "instr_1", handler_id: "sandbox_pay", type: "card", credential: { type: "PAYMENT_GATEWAY", token: SANDBOX_TOKEN } }] };

async function complete(checkout: Checkout, mandate: string | undefined, fetcher: typeof fetch, extraHeaders = {}) {
  const res = await completeCheckout(
    new Request(`http://${HOST}/ucp/v1/checkout-sessions/${checkout.id}/complete`, {
      method: "POST",
      headers: { ...headers, ...extraHeaders },
      body: JSON.stringify({ payment, ...(mandate ? { ap2: { checkout_mandate: mandate } } : {}) }),
    }),
    checkout.id,
    fetcher,
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe("checkout completion requires a signed AP2 mandate", async () => {
  const platform = await platformKeyPair();
  const fetcher = (async () => new Response(JSON.stringify({ keys: [platform.publicJwk] }))) as unknown as typeof fetch;

  beforeEach(() => {
    resetStore();
    clearPlatformKeyCache();
  });

  it("signs every checkout with the store key", async () => {
    const checkout = await newCheckout();
    expect(checkout.ap2?.merchant_authorization).toMatch(/^[\w-]+\.\.[\w-]+$/);
    expect(checkout.status).toBe("ready_for_complete");
  });

  it("refuses to complete without a mandate", async () => {
    const checkout = await newCheckout();
    const res = await complete(checkout, undefined, fetcher);
    expect(res.status).toBe(403);
    expect(res.body.messages[0].code).toBe("mandate_missing");
    expect(stockOf(VARIANT)).toBe(3);
    expect(listOrders()).toHaveLength(0);
  });

  it("refuses a mandate signed by an unknown key", async () => {
    const checkout = await newCheckout();
    const intruder = await platformKeyPair("encargo-test"); // same kid, different key
    const mandate = await makeMandate({ checkout, privateKey: intruder.privateKey, kid: intruder.kid, aud: `https://${HOST}` });
    const res = await complete(checkout, mandate, fetcher);
    expect(res.status).toBe(403);
    expect(res.body.messages[0].code).toBe("mandate_signature");
  });

  it("refuses a platform the store does not trust", async () => {
    const checkout = await newCheckout();
    const mandate = await makeMandate({ checkout, privateKey: platform.privateKey, kid: platform.kid, aud: `https://${HOST}` });
    const res = await complete(checkout, mandate, fetcher, { "ucp-agent": 'profile="https://evil.test/.well-known/ucp"' });
    expect(res.status).toBe(403);
  });

  it("refuses a mandate for different terms", async () => {
    const checkout = await newCheckout();
    const tampered = { ...checkout, totals: [{ type: "total", amount: 100 }] } as Checkout;
    const mandate = await makeMandate({ checkout: tampered, privateKey: platform.privateKey, kid: platform.kid, aud: `https://${HOST}` });
    const res = await complete(checkout, mandate, fetcher);
    expect(res.status).toBe(403);
    expect(["mandate_mismatch", "mandate_malformed"]).toContain(res.body.messages[0].code);
  });

  it("refuses a mandate approved for another checkout", async () => {
    const first = await newCheckout();
    const second = await newCheckout();
    const mandate = await makeMandate({ checkout: first, privateKey: platform.privateKey, kid: platform.kid, aud: `https://${HOST}` });
    const res = await complete(second, mandate, fetcher);
    expect(res.status).toBe(403);
    expect(res.body.messages[0].code).toBe("mandate_mismatch");
  });

  it("refuses an expired mandate or one addressed to another store", async () => {
    const checkout = await newCheckout();
    const expired = await makeMandate({ checkout, privateKey: platform.privateKey, kid: platform.kid, aud: `https://${HOST}`, exp: 1 });
    expect((await complete(checkout, expired, fetcher)).body.messages[0].code).toBe("mandate_expired");
    const elsewhere = await makeMandate({ checkout, privateKey: platform.privateKey, kid: platform.kid, aud: "https://pulso.test" });
    expect((await complete(checkout, elsewhere, fetcher)).body.messages[0].code).toBe("mandate_audience");
  });

  it("places the order with a valid mandate, exactly once", async () => {
    const checkout = await newCheckout();
    const mandate = await makeMandate({ checkout, privateKey: platform.privateKey, kid: platform.kid, aud: `https://${HOST}` });
    const res = await complete(checkout, mandate, fetcher);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.order.id).toMatch(/^ord_/);
    expect(stockOf(VARIANT)).toBe(2);
    expect(listOrders()).toHaveLength(1);
    const replay = await complete(checkout, mandate, fetcher);
    expect(replay.status).toBe(409);
    expect(listOrders()).toHaveLength(1);
  });
});
