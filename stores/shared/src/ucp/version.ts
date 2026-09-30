// UCP release implemented by these stores (https://ucp.dev, release branch
// `release/2026-08-25` of github.com/Universal-Commerce-Protocol/ucp).
export const UCP_VERSION = "2026-08-25";

export const CAPABILITIES = {
  catalogSearch: "dev.ucp.shopping.catalog.search",
  catalogLookup: "dev.ucp.shopping.catalog.lookup",
  cart: "dev.ucp.shopping.cart",
  checkout: "dev.ucp.shopping.checkout",
  fulfillment: "dev.ucp.shopping.fulfillment",
  ap2Mandate: "dev.ucp.common.payment.ap2_mandate",
} as const;

/** Sandbox payment handler: no real money or cards ever move in this demo. */
export const SANDBOX_HANDLER = "org.example.sandbox_pay";
export const SANDBOX_TOKEN = "sandbox_tok_ok";
