// schema.org structured data for a product page: the same facts a human reads,
// published so a machine can read them too. ProductGroup + one Product variant
// per size, each with an Offer (price, availability) and OfferShippingDetails
// (shipping rate, destination and delivery time in business days).
import type { Product } from "./catalog";

const BUSINESS_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => `https://schema.org/${d}`);

export function shippingDetails(p: Product) {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: p.shipping.rateCents / 100, currency: p.currency },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: p.shipping.country },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: p.shipping.handlingDays[0],
        maxValue: p.shipping.handlingDays[1],
        unitCode: "DAY",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: p.shipping.transitDays[0],
        maxValue: p.shipping.transitDays[1],
        unitCode: "DAY",
      },
      businessDays: { "@type": "OpeningHoursSpecification", dayOfWeek: BUSINESS_DAYS },
    },
  };
}

export function productJsonLd(p: Product, baseUrl: string, pagePath: string) {
  const url = `${baseUrl}${pagePath}`;
  const price = (p.priceCents / 100).toFixed(2);
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${url}#product`,
    productGroupID: p.id,
    name: p.name,
    description: p.description,
    brand: { "@type": "Brand", name: p.brand },
    category: p.category === "trail" ? "Tenis de trail running" : "Tenis de running para ruta",
    additionalProperty: [{ "@type": "PropertyValue", name: "terreno", value: p.category }],
    color: p.color,
    image: [`${baseUrl}${p.image}`],
    url,
    variesBy: ["https://schema.org/size"],
    hasVariant: p.variants.map((v) => ({
      "@type": "Product",
      "@id": `${url}#${v.id}`,
      sku: v.sku,
      name: `${p.name} — talla ${v.size}`,
      size: v.size,
      offers: {
        "@type": "Offer",
        url: `${url}?talla=${v.size}`,
        price,
        priceCurrency: p.currency,
        itemCondition: "https://schema.org/NewCondition",
        availability: v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        shippingDetails: shippingDetails(p),
      },
    })),
  };
}

/** Serialized for a <script type="application/ld+json"> tag (escapes "<"). */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
