// What an agent can read from an agent-ready store: structured data, feed, profile, catalog.
import { describe, expect, it } from "vitest";
import { listProducts, productBySlug } from "../src/db";
import { productJsonLd } from "../src/schemaOrg";
import { merchantFeedXml } from "../src/merchantFeed";
import { businessProfile } from "../src/ucp/profile";
import { catalogSearch } from "../src/ucp/catalogApi";
import { setAgentReady, isAgentReady } from "../src/store";
import { agentReadyOnly, json } from "../src/ucp/http";
import { addBusinessDays } from "../src/delivery";

describe("seed catalog at Kilómetro", () => {
  it("has 10 models and the errand model at 145 USD with size 9 in stock", () => {
    expect(listProducts()).toHaveLength(10);
    const p = productBySlug("acatenango-t3")!;
    expect(p.priceCents).toBe(14500);
    expect(p.category).toBe("trail");
    expect(p.variants.find((v) => v.size === "9")!.stock).toBeGreaterThan(0);
    expect(p.shipping.handlingDays[1] + p.shipping.transitDays[1]).toBe(1);
  });
});

describe("schema.org JSON-LD", () => {
  it("publishes price, availability per size and delivery time", () => {
    const ld = productJsonLd(productBySlug("acatenango-t3")!, "https://km.test", "/productos/acatenango-t3") as any;
    expect(ld["@type"]).toBe("ProductGroup");
    const size9 = ld.hasVariant.find((v: any) => v.size === "9");
    expect(size9.offers.price).toBe("145.00");
    expect(size9.offers.availability).toBe("https://schema.org/InStock");
    expect(size9.offers.shippingDetails.deliveryTime.transitTime.maxValue).toBe(1);
  });
});

describe("Merchant Center feed", () => {
  it("has one item per size with price, availability and transit time", () => {
    const xml = merchantFeedXml(listProducts(), "https://km.test", "Kilómetro");
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<g:id>KM-SND-001-9</g:id>");
    expect(xml).toContain("<g:price>145.00 USD</g:price>");
    expect(xml).toContain("<g:max_transit_time>1</g:max_transit_time>");
    expect(xml).not.toContain("&amp;gt;");
  });
});

describe("UCP", () => {
  it("profile advertises catalog, cart, checkout, AP2 mandates and a signing key", async () => {
    const profile = (await businessProfile("https://km.test")) as any;
    expect(profile.ucp.services["dev.ucp.shopping"][0].endpoint).toBe("https://km.test/ucp/v1");
    expect(Object.keys(profile.ucp.capabilities)).toEqual(
      expect.arrayContaining(["dev.ucp.shopping.catalog.search", "dev.ucp.shopping.checkout", "dev.ucp.common.payment.ap2_mandate"]),
    );
    expect(profile.keys[0]).toMatchObject({ kty: "EC", crv: "P-256", alg: "ES256" });
    expect(profile.keys[0].d).toBeUndefined();
  });

  it("catalog search filters by query and max price (cents)", async () => {
    const res = await catalogSearch(
      new Request("http://km.test/ucp/v1/catalog/search", {
        method: "POST",
        body: JSON.stringify({ query: "trail", filters: { price: { max: 15000 } } }),
      }),
    );
    const body = (await res.json()) as any;
    const titles = body.products.map((p: any) => p.title);
    expect(titles).toContain("Senda Acatenango T3");
    expect(titles).not.toContain("Senda Tajumulco X");
    expect(titles).not.toContain("Senda Ritmo");
  });
});

describe("control mode", () => {
  it("Kilómetro is always agent-ready", async () => {
    setAgentReady(false);
    expect(isAgentReady()).toBe(true);
    const handler = agentReadyOnly(() => json({ ok: true }));
    expect((await handler()).status).toBe(200);
  });
});

describe("business days", () => {
  it("skips weekends", () => {
    const thursday = new Date(Date.UTC(2026, 9, 1));
    expect(addBusinessDays(thursday, 1).getUTCDay()).toBe(5);
    expect(addBusinessDays(thursday, 2).getUTCDay()).toBe(1);
  });
});

describe("store admin key", () => {
  it("fails closed in production without ADMIN_TOKEN", async () => {
    const { isAdmin } = await import("../src/admin");
    const env = { ...process.env };
    process.env.NODE_ENV = "production";
    delete process.env.ADMIN_TOKEN;
    expect(isAdmin(new Request("http://x", { headers: { authorization: "Bearer dev-admin" } }))).toBe(false);
    process.env.NODE_ENV = env.NODE_ENV;
    process.env.ADMIN_TOKEN = env.ADMIN_TOKEN;
  });
});
