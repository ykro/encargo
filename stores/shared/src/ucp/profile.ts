// The business profile at /.well-known/ucp: the one document an agent reads to
// learn what this store can do (catalog, cart, checkout), where the endpoints
// are, how payment works and which key signs the store's checkouts.
import { merchantKey } from "../ap2/merchantKey";
import { CAPABILITIES, SANDBOX_HANDLER, UCP_VERSION } from "./version";

const spec = (path: string) => `https://ucp.dev/${UCP_VERSION}/${path}`;

function capability(name: string, specPath: string, schemaPath: string, extra: Record<string, unknown> = {}) {
  return { [name]: [{ version: UCP_VERSION, spec: spec(specPath), schema: spec(schemaPath), ...extra }] };
}

export async function businessProfile(baseUrl: string) {
  const key = await merchantKey();
  return {
    ucp: {
      version: UCP_VERSION,
      services: {
        "dev.ucp.shopping": [
          {
            version: UCP_VERSION,
            spec: spec("specification/overview/"),
            transport: "rest",
            endpoint: `${baseUrl}/ucp/v1`,
            schema: spec("services/shopping/rest.openapi.json"),
          },
        ],
      },
      capabilities: {
        ...capability(CAPABILITIES.catalogSearch, "specification/shopping/catalog/search", "schemas/shopping/catalog_search.json"),
        ...capability(CAPABILITIES.catalogLookup, "specification/shopping/catalog/lookup", "schemas/shopping/catalog_lookup.json"),
        ...capability(CAPABILITIES.cart, "specification/shopping/cart", "schemas/shopping/cart.json"),
        ...capability(CAPABILITIES.checkout, "specification/shopping/checkout", "schemas/shopping/checkout.json"),
        ...capability(
          CAPABILITIES.fulfillment,
          "specification/shopping/extensions/fulfillment",
          "schemas/shopping/fulfillment.json",
          { extends: CAPABILITIES.checkout },
        ),
        ...capability(
          CAPABILITIES.ap2Mandate,
          "specification/payment/extensions/ap2-mandates",
          "schemas/common/payment_ap2_mandate.json",
          { extends: CAPABILITIES.checkout, config: { vp_formats_supported: { "dc+sd-jwt": {} } } },
        ),
      },
      payment_handlers: {
        [SANDBOX_HANDLER]: [
          {
            id: "sandbox_pay",
            version: UCP_VERSION,
            spec: `${baseUrl}/ucp/v1/payment-handlers/sandbox-pay`,
            available_instruments: [{ type: "card" }],
            config: { environment: "sandbox", note: "Pagos simulados: no se mueve dinero real." },
          },
        ],
      },
    },
    keys: [key.publicJwk],
  };
}
