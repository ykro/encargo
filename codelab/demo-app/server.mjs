import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4324);

// ============================================================================
// 1. TIENDAS DE EJEMPLO PRECARGADAS (0/8 PULSO, 3/8 CAFÉ NUBE, 8/8 KILÓMETRO)
// ============================================================================
export const STORE_EXAMPLES = {
  pulso: {
    id: "pulso",
    name: "Pulso Outdoor",
    badge: "Ejemplo A · 0/8 Puntos",
    tagline: "Tienda visual en Instagram pero opaca al agente",
    humanVisual: {
      bannerTitle: "PULSO OUTDOOR · COLECCIÓN VOLCÁN",
      productTitle: "Botas Acatenango T3 Impermeables (Imagen promocional)",
      displayedPrice: "Q1,190.00 ($139 USD) — ¡Oferta en banner JPG!",
      sizeSelectorLabel: "Selector interactivo en <canvas>: Tallas 39 a 44",
      shippingBanner: "Envío rápido calculado en el paso 5 del carrito",
      checkoutFlow: "7 pantallas visuales + registro obligatorio de cuenta",
      visualAppealNote:
        "Para un humano luce atractiva y es Q60 más barata que la competencia, pero toda la información vive encerrada en imágenes y scripts opacos.",
    },
    robotsTxt: `User-agent: *\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /\nUser-agent: Claude-SearchBot\nDisallow: /\nUser-agent: Google-Extended\nDisallow: /`,
    httpAgentAccess: false,
    html: `<!DOCTYPE html><html><head><title>Pulso Outdoor</title></head><body><div id="root"></div><canvas id="size-picker"></canvas><img src="/promo-acatenango-1190.jpg" alt="Promo" /></body></html>`,
    feedXml: "",
    ucpManifest: null,
    ap2Support: false,
    businessSummaryNote:
      "Pulso pagó el anuncio en Instagram y tiene el mejor precio (Q1,190 vs Q1,250), pero pierde el 100% de las compras delegadas a agentes (0 de 78 corridas en el estudio) porque bloquea buscadores de IA y esconde precio, tallas y envío.",
  },

  cafenube: {
    id: "cafenube",
    name: "Café Nube & Gear",
    badge: "Ejemplo B · 3/8 Puntos",
    tagline: "Catálogo parcial que oculta envío y stock por variante",
    humanVisual: {
      bannerTitle: "CAFÉ NUBE · EQUIPAMIENTO DE MONTAÑA",
      productTitle: "Botas Acatenango T3 — Edición Montaña",
      displayedPrice: "Q1,220.00 ($142 USD) en texto HTML",
      sizeSelectorLabel: "Menú desplegable JS (sin estado por talla en el código)",
      shippingBanner: "Costo y fecha de entrega visibles al ingresar tarjeta",
      checkoutFlow: "Carrito tradicional de 5 pasos con formulario manual",
      visualAppealNote:
        "Representa a la mayoría de comercios actuales en plantilla estándar: el agente logra entrar y leer el precio base, pero abandona porque no puede comprobar si hay talla 42 ni si llega antes del viernes.",
    },
    robotsTxt: `User-agent: OAI-SearchBot\nAllow: /\nUser-agent: Claude-SearchBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /`,
    httpAgentAccess: true,
    html: `<!DOCTYPE html><html><head><title>Café Nube</title>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Botas Acatenango T3 — Edición Montaña",
      "offers": {
        "@type": "Offer",
        "price": "1220.00",
        "priceCurrency": "GTQ",
        "availability": "https://schema.org/InStock"
      }
    }
    </script></head><body>
      <h1>Botas Acatenango T3 — Edición Montaña</h1>
      <p class="price">Precio: Q1,220.00 GTQ ($142 USD)</p>
      <p>Selecciona tu talla en el menú interactivo. Envío calculado al finalizar la compra.</p>
    </body></html>`,
    feedXml: "",
    ucpManifest: null,
    ap2Support: false,
    businessSummaryNote:
      "Café Nube aprueba 3 puntos (robots.txt abierto, acceso HTTP limpio y texto HTML con precio base). Sin embargo, cuando el cliente pide «talla 42 y que llegue antes del viernes», el agente la descarta porque no desglosa stock por variante (ProductGroup) ni publica tiempos de envío (OfferShippingDetails).",
  },

  kilometro: {
    id: "kilometro",
    name: "Kilómetro Outdoor",
    badge: "Ejemplo C · 8/8 Puntos",
    tagline: "Tienda lista para humanos y agentes (Compra en 3 pasos)",
    humanVisual: {
      bannerTitle: "KILÓMETRO · EQUIPO TÉCNICO DE MONTAÑA",
      productTitle: "Botas Senda Acatenango T3 Impermeables",
      displayedPrice: "Q1,250.00 ($145 USD) · IVA incluido",
      sizeSelectorLabel: "Talla 41 (Agotada) · Talla 42 / US 9 (En Stock: 6 pares)",
      shippingBanner: "Envío Q0.00 · Preparación 0 días + Tránsito 1 día hábil",
      checkoutFlow: "Checkout humano + Cotización UCP en 1 paso + Firma Passkey AP2",
      visualAppealNote:
        "Aunque cuesta Q60 más que Pulso, gana el 100% de las compras cuando Pulso es opaca porque el agente comprueba en 1 segundo producto, talla 42 en stock, entrega en 24h y pago con Passkey.",
    },
    robotsTxt: `User-agent: OAI-SearchBot\nAllow: /\nUser-agent: Claude-SearchBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\nUser-agent: PerplexityBot\nAllow: /`,
    httpAgentAccess: true,
    html: `<!DOCTYPE html><html><head><title>Kilómetro Outdoor — Botas Senda Acatenango T3</title>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      "name": "Botas Senda Acatenango T3 Impermeables",
      "productGroupID": "KM-ACAT-T3",
      "brand": { "@type": "Brand", "name": "Senda" },
      "variesBy": ["https://schema.org/size"],
      "hasVariant": [
        {
          "@type": "Product",
          "sku": "KM-ACAT-T3-41",
          "name": "Botas Senda Acatenango T3 - Talla 41",
          "size": "41",
          "offers": {
            "@type": "Offer",
            "price": "1250.00",
            "priceCurrency": "GTQ",
            "availability": "https://schema.org/OutOfStock"
          }
        },
        {
          "@type": "Product",
          "sku": "KM-ACAT-T3-42",
          "name": "Botas Senda Acatenango T3 - Talla 42 (US 9)",
          "size": "42",
          "offers": {
            "@type": "Offer",
            "price": "1250.00",
            "priceCurrency": "GTQ",
            "availability": "https://schema.org/InStock",
            "shippingDetails": {
              "@type": "OfferShippingDetails",
              "shippingRate": { "@type": "MonetaryAmount", "value": "0.00", "currency": "GTQ" },
              "deliveryTime": {
                "@type": "ShippingDeliveryTime",
                "handlingTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 0, "unitCode": "DAY" },
                "transitTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 1, "unitCode": "DAY" }
              }
            }
          }
        }
      ]
    }
    </script></head><body>
      <article>
        <h1>Botas Senda Acatenango T3 Impermeables</h1>
        <p class="price">Precio oficial: Q1,250.00 GTQ ($145 USD)</p>
        <p class="stock">Talla 42 (US 9): Disponible en inventario (SKU KM-ACAT-T3-42)</p>
        <p class="shipping">Envío gratis Q0.00 · Entrega en 1 día hábil (Llega el miércoles, antes del viernes)</p>
      </article>
    </body></html>`,
    feedXml: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Kilómetro Outdoor — Catálogo</title>
    <item>
      <g:id>KM-ACAT-T3-42</g:id>
      <g:item_group_id>KM-ACAT-T3</g:item_group_id>
      <title>Botas Senda Acatenango T3 Impermeables - Talla 42</title>
      <g:price>1250.00 GTQ</g:price>
      <g:availability>in_stock</g:availability>
      <g:size>42</g:size>
      <g:shipping><g:price>0.00 GTQ</g:price><g:min_transit_time>1</g:min_transit_time><g:max_transit_time>1</g:max_transit_time></g:shipping>
    </item>
  </channel>
</rss>`,
    ucpManifest: {
      ucp_version: "2026-08-25",
      merchant: { id: "kilometro-gt", name: "Kilómetro Outdoor", currency: "GTQ" },
      services: [
        {
          id: "dev.ucp.shopping",
          endpoint: "https://kilometro.ejemplo.gt/api/ucp/checkout",
          capabilities: ["catalog.lookup", "cart", "checkout"],
          extensions: ["fulfillment", "dev.ucp.common.payment.ap2_mandate"],
        },
      ],
    },
    ap2Support: true,
    businessSummaryNote:
      "Kilómetro publica cada dato que el agente necesita verificar sin obligarlo a adivinar. Cuando ambos comercios tienen 8/8, el agente compara precios en igualdad de condiciones; cuando solo Kilómetro tiene 8/8, Kilómetro captura todas las ventas.",
  },
};

// ============================================================================
// 2. CONSTRUCTOR DE TIENDA REPARADA PASO A PASO (MODO TUTORIAL 0/8 → 8/8)
// ============================================================================
export function buildTutorialStoreBundle(fixes = {}) {
  const f1 = Boolean(fixes.fix1_robots);
  const f2 = Boolean(fixes.fix2_jsonld);
  const f3 = Boolean(fixes.fix3_ssr_feed);
  const f4 = Boolean(fixes.fix4_ucp_ap2);

  const robotsTxt = f1
    ? `User-agent: OAI-SearchBot\nAllow: /\nUser-agent: Claude-SearchBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\nSitemap: https://pulso.ejemplo.gt/sitemap.xml`
    : STORE_EXAMPLES.pulso.robotsTxt;

  const jsonLdScript = f2
    ? `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ProductGroup",
  "name": "Botas Acatenango T3 Impermeables",
  "productGroupID": "PULSO-ACAT-T3",
  "brand": { "@type": "Brand", "name": "Senda" },
  "variesBy": ["https://schema.org/size"],
  "hasVariant": [
    {
      "@type": "Product",
      "sku": "PULSO-ACAT-T3-41",
      "size": "41",
      "offers": { "@type": "Offer", "price": "1190.00", "priceCurrency": "GTQ", "availability": "https://schema.org/OutOfStock" }
    },
    {
      "@type": "Product",
      "sku": "PULSO-ACAT-T3-42",
      "name": "Botas Acatenango T3 Impermeables - Talla 42 (US 9)",
      "size": "42",
      "offers": {
        "@type": "Offer",
        "price": "1190.00",
        "priceCurrency": "GTQ",
        "availability": "https://schema.org/InStock",
        "shippingDetails": {
          "@type": "OfferShippingDetails",
          "shippingRate": { "@type": "MonetaryAmount", "value": "0.00", "currency": "GTQ" },
          "deliveryTime": {
            "@type": "ShippingDeliveryTime",
            "handlingTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 0, "unitCode": "DAY" },
            "transitTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 1, "unitCode": "DAY" }
          }
        }
      }
    }
  ]
}
</script>`
    : "";

  const ssrBody = f3
    ? `<article>
  <h1>Botas Acatenango T3 Impermeables</h1>
  <p class="price">Precio directo: Q1,190.00 GTQ ($139 USD)</p>
  <p class="stock">Talla 42 (US 9): En Stock (SKU PULSO-ACAT-T3-42)</p>
  <p class="shipping">Envío gratis Q0.00 · Entrega en 1 día hábil (Llega antes del viernes)</p>
</article>`
    : `<div id="root"></div><canvas id="size-picker"></canvas><img src="/promo-acatenango-1190.jpg" alt="Promo" />`;

  const html = `<!DOCTYPE html><html><head><title>Pulso Outdoor</title>${jsonLdScript}</head><body>${ssrBody}</body></html>`;

  const feedXml = f3
    ? `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Pulso Outdoor — Catálogo Rápido</title>
    <item>
      <g:id>PULSO-ACAT-T3-42</g:id>
      <title>Botas Acatenango T3 Impermeables - Talla 42</title>
      <g:price>1190.00 GTQ</g:price>
      <g:availability>in_stock</g:availability>
      <g:size>42</g:size>
    </item>
  </channel>
</rss>`
    : "";

  const ucpManifest = f4
    ? {
        ucp_version: "2026-08-25",
        merchant: { id: "pulso-outdoor-gt", name: "Pulso Outdoor", currency: "GTQ" },
        services: [
          {
            id: "dev.ucp.shopping",
            endpoint: "https://pulso.ejemplo.gt/api/ucp/checkout",
            capabilities: ["catalog.lookup", "cart", "checkout"],
            extensions: ["fulfillment", "dev.ucp.common.payment.ap2_mandate"],
          },
        ],
      }
    : null;

  return {
    id: "pulso-tutorial",
    name: "Pulso Outdoor (En Laboratorio de Reparación)",
    badge: "Modo Tutorial · Paso a Paso",
    tagline: "Aplicando las 4 correcciones para pasar de 0/8 a 8/8",
    humanVisual: {
      bannerTitle: "PULSO OUTDOOR · LABORATORIO DE REPARACIÓN",
      productTitle: "Botas Acatenango T3 Impermeables",
      displayedPrice: f3
        ? "Q1,190.00 ($139 USD) en texto HTML SSR + imagen"
        : "Q1,190.00 ($139 USD) incrustado solo en imagen JPG",
      sizeSelectorLabel: f2
        ? "Talla 42 (US 9) declarada en ProductGroup JSON-LD (SKU PULSO-ACAT-T3-42)"
        : "Selector encerrado en <canvas> sin datos para el agente",
      shippingBanner: f2
        ? "OfferShippingDetails activo: Envío Q0.00 · 0d prep + 1d tránsito"
        : "Oculto hasta la pantalla 5 del carrito",
      checkoutFlow: f4
        ? "Cotización UCP en 1 paso + Autorización biométrica Passkey AP2"
        : "7 pantallas manuales con registro obligatorio",
      visualAppealNote:
        "Para el comprador humano la tienda sigue luciendo idéntica, pero cada interruptor que activas desbloquea una capa de certeza verificable para su agente de IA.",
    },
    robotsTxt,
    httpAgentAccess: f1,
    html,
    feedXml,
    ucpManifest,
    ap2Support: f4,
    businessSummaryNote:
      f1 && f2 && f3 && f4
        ? "¡Tienda reparada a 8/8! Como Pulso tiene mejor precio (Q1,190 vs Q1,250 de Kilómetro) y ahora ofrece la misma certeza verificable, el agente elige a Pulso y aprueba la compra."
        : "Activa las 4 correcciones en orden para observar cómo sube la puntuación de 0/8 → 2/8 → 4/8 → 6/8 → 8/8 y en qué momento el agente aprueba el pedido.",
    activeFixes: { fix1_robots: f1, fix2_jsonld: f2, fix3_ssr_feed: f3, fix4_ucp_ap2: f4 },
  };
}

// ============================================================================
// 3. MOTOR DE AUDITORÍA DE 8 PUNTOS CON NOTAS EXPLICATIVAS DE NEGOCIO
// ============================================================================
export function parseJsonLdBlocks(html = "") {
  const blocks = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      blocks.push(parsed);
    } catch {
      // Ignorar bloques JSON-LD malformados
    }
  }
  return blocks;
}

export function auditStoreBundle(bundle) {
  const robots = String(bundle.robotsTxt || "");
  const html = String(bundle.html || "");
  const feedXml = String(bundle.feedXml || "");
  const jsonLdBlocks = parseJsonLdBlocks(html);

  // Punto 1: robots.txt permite agentes de compra (OAI-SearchBot, Claude-SearchBot, Google-Extended)
  const allowsSearchBots =
    /OAI-SearchBot[\s\S]*?Allow:\s*\//i.test(robots) &&
    /Claude-SearchBot[\s\S]*?Allow:\s*\//i.test(robots) &&
    !/User-agent:\s*\*[\s\S]*?Disallow:\s*\//i.test(robots.split(/User-agent:\s*OAI-SearchBot/i)[0] || "");

  // Punto 2: Respuesta HTTP inicial abierta a asistentes sin bloqueo anti-bot
  const hasHttpAccess = Boolean(bundle.httpAgentAccess) && allowsSearchBots;

  // Analizar JSON-LD para Puntos 3 y 4
  let hasVariantStock = false;
  let hasShippingDetails = false;
  let extractedProduct = null;
  let extractedPrice = null;
  let extractedCurrency = null;
  let extractedSku = null;
  let extractedSize = null;
  let extractedAvailability = null;
  let extractedShippingDays = null;
  let extractedShippingCost = null;

  for (const block of jsonLdBlocks) {
    if (block["@type"] === "ProductGroup" && Array.isArray(block.hasVariant)) {
      extractedProduct = block.name || extractedProduct;
      const inStockVariant = block.hasVariant.find(
        v => v?.offers && String(v.offers.availability || "").includes("InStock")
      );
      if (inStockVariant && inStockVariant.sku && inStockVariant.size) {
        hasVariantStock = true;
        extractedSku = inStockVariant.sku;
        extractedSize = String(inStockVariant.size);
        extractedPrice = inStockVariant.offers.price;
        extractedCurrency = inStockVariant.offers.priceCurrency || "GTQ";
        extractedAvailability = "InStock";

        const ship = inStockVariant.offers.shippingDetails;
        if (
          ship &&
          ship["@type"] === "OfferShippingDetails" &&
          ship.deliveryTime &&
          ship.deliveryTime.transitTime !== undefined
        ) {
          hasShippingDetails = true;
          const hMax = Number(ship.deliveryTime.handlingTime?.maxValue ?? 0);
          const tMax = Number(ship.deliveryTime.transitTime?.maxValue ?? 1);
          extractedShippingDays = hMax + tMax;
          extractedShippingCost = `${ship.shippingRate?.value || "0.00"} ${ship.shippingRate?.currency || "GTQ"}`;
        }
      }
    } else if (block["@type"] === "Product") {
      extractedProduct = block.name || extractedProduct;
      if (block.offers?.price) {
        extractedPrice = block.offers.price;
        extractedCurrency = block.offers.priceCurrency || "GTQ";
        extractedAvailability = "InStock (General, sin desglose de talla)";
      }
    }
  }

  // Punto 5: Contenido y precios en el HTML inicial (SSR) sin depender de JS o <canvas>
  const strippedText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hasSsrContent =
    strippedText.length > 40 &&
    /(?:Q\s*1,?\d{3}|\$\s*1\d{2}|GTQ|USD)/i.test(strippedText) &&
    /Acatenango/i.test(strippedText);

  if (hasSsrContent && !extractedProduct) {
    extractedProduct = "Botas Acatenango T3 (Leído en texto HTML)";
  }
  if (hasSsrContent && !extractedPrice) {
    const m = strippedText.match(/Q\s*([0-9,]+\.?\d*)/i);
    if (m) {
      extractedPrice = m[1].replace(",", "");
      extractedCurrency = "GTQ";
    }
  }

  // Punto 6: Catálogo rápido /feed.xml disponible
  const hasFeedXml =
    feedXml.includes("<rss") &&
    feedXml.includes("<g:id>") &&
    feedXml.includes("<g:price>");

  // Punto 7: Cotización directa en 1 paso (/.well-known/ucp)
  const hasUcp = Boolean(
    bundle.ucpManifest &&
      bundle.ucpManifest.ucp_version &&
      Array.isArray(bundle.ucpManifest.services) &&
      bundle.ucpManifest.services.length > 0
  );

  // Punto 8: Autorización con Passkey (AP2 CartMandate)
  const hasAp2 = Boolean(bundle.ap2Support && hasUcp);

  const checks = [
    {
      id: "robots_searchbots",
      pointNumber: 1,
      stage: "Etapa 1 · Descubrir",
      title: "1. Permiso en robots.txt a agentes de compra",
      target: "OAI-SearchBot, Claude-SearchBot, Google-Extended",
      passed: allowsSearchBots,
      statusLabel: allowsSearchBots ? "APROBADO" : "BLOQUEADO",
      findingNote: allowsSearchBots
        ? "Tu archivo /robots.txt autoriza explícitamente a los buscadores y asistentes de compra de IA."
        : "Tu /robots.txt tiene Disallow: / para bots de IA. El agente respeta la prohibición y ni siquiera entra a tu tienda.",
      businessImpactNote:
        "Muchos comercios bloquearon todos los bots en 2024 para evitar entrenamiento de modelos y, por accidente, cerraron la puerta a los asistentes que traen clientes con tarjeta en mano.",
      fixRecipeStep: 1,
    },
    {
      id: "http_ssr_access",
      pointNumber: 2,
      stage: "Etapa 1 · Descubrir",
      title: "2. Acceso HTTP directo sin bloqueo anti-agente",
      target: "Respuesta 200 OK sin captcha ni cascarón bloqueado",
      passed: hasHttpAccess,
      statusLabel: hasHttpAccess ? "APROBADO" : "FALLO",
      findingNote: hasHttpAccess
        ? "El servidor entrega el documento HTML en menos de 200ms sin exigir retos visuales."
        : "El servidor rechaza la lectura automatizada o devuelve un contenedor cerrado para asistentes.",
      businessImpactNote:
        "Un agente compara 5 tiendas en menos de 3 segundos; si tu tienda exige resolver un reto visual antes de ver el catálogo, queda fuera de la comparación.",
      fixRecipeStep: 1,
    },
    {
      id: "jsonld_product_variants",
      pointNumber: 3,
      stage: "Etapa 1 · Descubrir",
      title: "3. Ficha JSON-LD ProductGroup con stock por talla",
      target: "hasVariant + SKU + InStock/OutOfStock por talla",
      passed: hasVariantStock,
      statusLabel: hasVariantStock ? "APROBADO" : "FALTA DESGLOSE",
      findingNote: hasVariantStock
        ? `Variante verificada: SKU ${extractedSku} (Talla ${extractedSize}) en estado InStock a ${extractedPrice} ${extractedCurrency}.`
        : extractedAvailability
        ? "Tienes un bloque Product básico con precio general, pero NO desglosas qué tallas tienen stock (ProductGroup + hasVariant)."
        : "No existe bloque JSON-LD de producto; el selector de tallas vive encerrado en un <canvas> o script visual.",
      businessImpactNote:
        "Es el motivo #1 de abandono en ropa y calzado: si el comprador pide «talla 42» y el agente solo ve «En Stock general», no se arriesga a comprar una talla agotada.",
      fixRecipeStep: 2,
    },
    {
      id: "jsonld_shipping_details",
      pointNumber: 4,
      stage: "Etapa 1 · Descubrir",
      title: "4. Costo y días de entrega en la ficha (OfferShippingDetails)",
      target: "handlingTime + transitTime + shippingRate en JSON-LD",
      passed: hasShippingDetails,
      statusLabel: hasShippingDetails ? "APROBADO" : "OCULTO EN CARRITO",
      findingNote: hasShippingDetails
        ? `Promesa verificada: ${extractedShippingDays} día(s) hábil(es) en total con tarifa de envío ${extractedShippingCost}.`
        : "La fecha y tarifa de envío no están declaradas en la ficha; la tienda obliga a llegar al paso 5 del carrito para conocerlas.",
      businessImpactNote:
        "Cuando el cliente encarga «que llegue antes del viernes», el agente descarta inmediatamente cualquier tienda donde la fecha de entrega sea una incógnita.",
      fixRecipeStep: 2,
    },
    {
      id: "ssr_initial_html",
      pointNumber: 5,
      stage: "Etapa 1 · Descubrir",
      title: "5. Nombre y precio visibles en el HTML inicial (SSR)",
      target: "Texto legible en la primera respuesta sin ejecutar JS",
      passed: hasSsrContent,
      statusLabel: hasSsrContent ? "APROBADO" : "PÁGINA VACÍA / JPG",
      findingNote: hasSsrContent
        ? "El nombre del producto, precio y descripción vienen renderizados en el HTML del servidor."
        : "El HTML inicial solo contiene <div id=\"root\"></div> y esconde el precio de oferta dentro de los píxeles de una imagen JPG.",
      businessImpactNote:
        "Los lectores rápidos de agentes no descargan ni ejecutan megabytes de JavaScript ni hacen OCR de banners promocionales durante la fase de filtrado.",
      fixRecipeStep: 3,
    },
    {
      id: "catalog_feed_xml",
      pointNumber: 6,
      stage: "Etapa 1 · Descubrir",
      title: "6. Catálogo rápido sincronizado en /feed.xml",
      target: "Archivo XML/JSON con inventario, precios y tallas",
      passed: hasFeedXml,
      statusLabel: hasFeedXml ? "APROBADO" : "AUSENTE",
      findingNote: hasFeedXml
        ? "Catálogo /feed.xml activo en formato Merchant Center; el agente lee precios y tallas en una sola petición."
        : "No se encontró /feed.xml; el agente tendría que rastrear página por página para comparar opciones.",
      businessImpactNote:
        "Si ya anuncias en Google Shopping o Meta Ads, tu tienda ya genera este feed; exponerlo públicamente acelera la lectura del agente 10x.",
      fixRecipeStep: 3,
    },
    {
      id: "ucp_one_step_quote",
      pointNumber: 7,
      stage: "Etapa 2 · Cotizar",
      title: "7. Cotización en 1 paso vía /.well-known/ucp",
      target: "Manifiesto UCP + checkout_hash sellado por API",
      passed: hasUcp,
      statusLabel: hasUcp ? "APROBADO" : "SOLO 7 PANTALLAS",
      findingNote: hasUcp
        ? `Manifiesto UCP v${bundle.ucpManifest.ucp_version} activo en ${bundle.ucpManifest.services[0].endpoint}.`
        : "Sin perfil /.well-known/ucp. Obliga a llenar formularios visuales de carrito, dirección y cuenta paso a paso.",
      businessImpactNote:
        "El Universal Commerce Protocol (UCP) colapsa las 7 pantallas del checkout tradicional en una sola llamada que devuelve el total exacto y un hash criptográfico.",
      fixRecipeStep: 4,
    },
    {
      id: "ap2_passkey_mandate",
      pointNumber: 8,
      stage: "Etapa 3 · Autorizar",
      title: "8. Autorización biométrica Passkey (AP2 CartMandate)",
      target: "Verificación de mandato firmado por huella/rostro del comprador",
      passed: hasAp2,
      statusLabel: hasAp2 ? "APROBADO" : "SIN MANDATO AP2",
      findingNote: hasAp2
        ? "Soporta extensión dev.ucp.common.payment.ap2_mandate con firma WebAuthn Passkey y SD-JWT."
        : "No acepta mandatos firmados AP2; requeriría compartir números de tarjeta en texto plano.",
      businessImpactNote:
        "Con AP2 el agente jamás toca la tarjeta del usuario: el comprador aprueba el monto exacto con su huella en el teléfono y la tienda recibe prueba matemática contra contracargos.",
      fixRecipeStep: 4,
    },
  ];

  const score = checks.filter(c => c.passed).length;

  let readinessTier = "Opaca al Agente (0 compras en 78 corridas)";
  let tierColor = "rose";
  if (score >= 8) {
    readinessTier = "Tienda Lista para Agentes (Compra en 3 pasos aprobada)";
    tierColor = "teal";
  } else if (score >= 6) {
    readinessTier = "Catálogo 100% Verificable (Falta checkout UCP/AP2)";
    tierColor = "blue";
  } else if (score >= 2) {
    readinessTier = "Visibilidad Parcial (El agente entra pero abandona por incertidumbre)";
    tierColor = "amber";
  }

  const agentExtractedView = {
    canAccessStore: allowsSearchBots && hasHttpAccess,
    productName: allowsSearchBots && hasHttpAccess ? extractedProduct || "NO LEGIBLE (Oculto en JPG / JS)" : "BLOQUEADO POR ROBOTS.TXT",
    priceAndCurrency:
      allowsSearchBots && hasHttpAccess && extractedPrice
        ? `Q${Number(extractedPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${extractedCurrency}`
        : "NO VERIFICABLE",
    size42Inventory:
      allowsSearchBots && hasHttpAccess && hasVariantStock
        ? `EN STOCK (SKU: ${extractedSku} · Talla ${extractedSize})`
        : allowsSearchBots && hasHttpAccess && extractedAvailability
        ? "AMBIGUO (Dice InStock general pero oculta tallas)"
        : "NO VERIFICABLE (Selector en <canvas>)",
    shippingPromise:
      allowsSearchBots && hasHttpAccess && hasShippingDetails
        ? `LLEGA EN ${extractedShippingDays} DÍA HÁBIL (${extractedShippingCost}) — Antes del viernes`
        : "NO VERIFICABLE (Oculto hasta el paso 5 del carrito)",
    checkoutProtocol: hasUcp && hasAp2 ? "UCP 1-Paso + Firma Passkey AP2" : "Formularios HTML manuales (7 pantallas)",
  };

  return {
    storeId: bundle.id || "custom",
    storeName: bundle.name || "Tienda Analizada",
    badge: bundle.badge || `Resultado · ${score}/8 Puntos`,
    tagline: bundle.tagline || "",
    score,
    maxScore: 8,
    readinessTier,
    tierColor,
    businessSummaryNote: bundle.businessSummaryNote || "",
    humanVisual: bundle.humanVisual || null,
    agentExtractedView,
    checks,
    activeFixes: bundle.activeFixes || null,
  };
}

// ============================================================================
// 4. SIMULADOR DE COMPRA DEL AGENTE (EVALÚA LAS 4 CONDICIONES DEL ENCARGO)
// ============================================================================
export function simulateAgentPurchase(auditResult, buyerOrder = {}) {
  const order = {
    itemRequest: buyerOrder.itemRequest || "Botas impermeables Acatenango T3",
    sizeRequest: buyerOrder.sizeRequest || "42 (US 9)",
    maxBudgetGTQ: Number(buyerOrder.maxBudgetGTQ || 1290),
    deadlineDay: buyerOrder.deadlineDay || "Viernes 18:00h (<= 2 días hábiles)",
  };

  const byId = Object.fromEntries(auditResult.checks.map(c => [c.id, c.passed]));
  const canEnter = byId.robots_searchbots && byId.http_ssr_access;
  const hasPrice = canEnter && (byId.ssr_initial_html || byId.jsonld_product_variants || auditResult.agentExtractedView.priceAndCurrency !== "NO VERIFICABLE");
  const hasSize42 = canEnter && byId.jsonld_product_variants;
  const hasShippingOnTime = canEnter && byId.jsonld_shipping_details;
  const hasAutonomousCheckout = canEnter && byId.ucp_one_step_quote && byId.ap2_passkey_mandate;

  const requirementsChecklist = [
    {
      requirement: `1. Producto y presupuesto (<= Q${order.maxBudgetGTQ})`,
      verified: hasPrice,
      detail: hasPrice
        ? `Verificado: ${auditResult.agentExtractedView.priceAndCurrency} está dentro del tope de Q${order.maxBudgetGTQ}.`
        : "Fallo: El agente no puede leer el precio porque el sitio bloquea el acceso o lo esconde en una imagen JPG.",
    },
    {
      requirement: `2. Talla ${order.sizeRequest} disponible en stock`,
      verified: hasSize42,
      detail: hasSize42
        ? `Verificado: ${auditResult.agentExtractedView.size42Inventory}.`
        : "Fallo: No hay desglose ProductGroup por variante; el agente no adivina si la talla 42 está agotada.",
    },
    {
      requirement: `3. Entrega garantizada antes del ${order.deadlineDay}`,
      verified: hasShippingOnTime,
      detail: hasShippingOnTime
        ? `Verificado: ${auditResult.agentExtractedView.shippingPromise}.`
        : "Fallo: Sin OfferShippingDetails en la ficha; imposible saber si llegará antes del viaje del viernes.",
    },
    {
      requirement: "4. Cotización UCP en 1 paso + Autorización Passkey AP2",
      verified: hasAutonomousCheckout,
      detail: hasAutonomousCheckout
        ? "Verificado: Cotización sellada con checkout_hash y firma biométrica WebAuthn Passkey lista."
        : "Pendiente: La tienda aún requiere checkout humano o no publica /.well-known/ucp + AP2.",
    },
  ];

  const allFourVerified = hasPrice && hasSize42 && hasShippingOnTime && hasAutonomousCheckout;
  const catalogVerifiedOnly = hasPrice && hasSize42 && hasShippingOnTime && !hasAutonomousCheckout;

  if (allFourVerified) {
    return {
      decision: "COMPRA_APROBADA_EN_3_PASOS",
      decisionBadge: "COMPRA COMPLETADA (8/8)",
      decisionColor: "teal",
      headline: `El Agente verificó las 4 condiciones en ${auditResult.storeName} y completó el pedido con autorización Passkey`,
      explanation:
        "Ninguna condición quedó en duda: el agente comprobó el precio, confirmó que la talla 42 tiene stock inmediato, verificó que llega en 1 día hábil (antes del viernes), pidió la cotización UCP y obtuvo la firma biométrica AP2 del comprador.",
      orderReceipt: {
        orderId: "ORD-ENC-2027-808",
        merchant: auditResult.storeName,
        sku: auditResult.agentExtractedView.size42Inventory.match(/SKU:\s*([A-Z0-9-]+)/)?.[1] || "KM-ACAT-T3-42",
        totalPaid: auditResult.agentExtractedView.priceAndCurrency,
        deliveryEta: "Miércoles (1 día hábil · Envío Q0.00)",
        checkoutHash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b",
        ap2Signature: "SD-JWT + WebAuthn Passkey (Touch ID / Face ID verificado)",
      },
      requirementsChecklist,
    };
  }

  if (catalogVerifiedOnly) {
    return {
      decision: "CANDIDATA_EN_CATALOGO_FALTA_CHECKOUT",
      decisionBadge: `CATÁLOGO VERIFICADO (${auditResult.score}/8) · FALTA UCP/AP2`,
      decisionColor: "blue",
      headline: `El Agente ya recomienda ${auditResult.storeName}, pero necesita la Corrección 4 (UCP + Passkey AP2) para cerrar el pago sin formularios`,
      explanation:
        "¡Gran avance! Con las correcciones 1, 2 y 3 el agente ya verifica producto, talla 42 en stock y entrega antes del viernes. Activa la Corrección 4 para habilitar la cotización en 1 paso y la firma con Passkey.",
      orderReceipt: null,
      requirementsChecklist,
    };
  }

  return {
    decision: "TIENDA_DESCARTADA_POR_INCERTIDUMBRE",
    decisionBadge: `TIENDA RECHAZADA (${auditResult.score}/8)`,
    decisionColor: "rose",
    headline: `El Agente descarta a ${auditResult.storeName} en 3 segundos porque no puede verificar las condiciones del comprador`,
    explanation:
      "Un agente responsable no arriesga el dinero del usuario adivinando si hay talla 42 o si el paquete llegará antes del viernes. Salta inmediatamente al competidor que sí publica datos verificables.",
    orderReceipt: null,
    requirementsChecklist,
  };
}

// ============================================================================
// 5. SERVIDOR HTTP DEL LABORATORIO (API + INTERFAZ WEB)
// ============================================================================
function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function createLabServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/api/examples") {
      const summaries = Object.values(STORE_EXAMPLES).map(ex => {
        const audit = auditStoreBundle(ex);
        const simulation = simulateAgentPurchase(audit);
        return { example: ex, audit, simulation };
      });
      return sendJson(res, 200, { examples: summaries });
    }

    if (req.method === "POST" && url.pathname === "/api/audit-example") {
      const body = await readJsonBody(req);
      const storeKey = String(body.storeId || "pulso").toLowerCase();
      const bundle = STORE_EXAMPLES[storeKey] || STORE_EXAMPLES.pulso;
      const audit = auditStoreBundle(bundle);
      const simulation = simulateAgentPurchase(audit, body.buyerOrder);
      return sendJson(res, 200, { audit, simulation, bundle });
    }

    if (req.method === "POST" && url.pathname === "/api/tutorial-fix") {
      const body = await readJsonBody(req);
      const bundle = buildTutorialStoreBundle(body.fixes || {});
      const audit = auditStoreBundle(bundle);
      const simulation = simulateAgentPurchase(audit, body.buyerOrder);
      return sendJson(res, 200, { audit, simulation, bundle });
    }

    if (req.method === "POST" && url.pathname === "/api/audit-custom") {
      const body = await readJsonBody(req);
      const customBundle = {
        id: "custom",
        name: body.storeName || "Mi Tienda Analizada",
        badge: "Auditoría Personalizada",
        tagline: "Análisis directo de HTML, robots.txt y manifiestos",
        robotsTxt: body.robotsTxt ?? `User-agent: OAI-SearchBot\nAllow: /\nUser-agent: Claude-SearchBot\nAllow: /`,
        httpAgentAccess: body.httpAgentAccess !== false,
        html: body.html || "",
        feedXml: body.feedXml || "",
        ucpManifest: body.ucpManifest || null,
        ap2Support: Boolean(body.ap2Support),
        businessSummaryNote:
          "Diagnóstico generado sobre el código proporcionado. Revisa cada fila de la tabla para ver qué puntos ya cumples y cuáles puedes activar con las recetas del tutorial.",
      };
      const audit = auditStoreBundle(customBundle);
      const simulation = simulateAgentPurchase(audit, body.buyerOrder);
      return sendJson(res, 200, { audit, simulation, bundle: customBundle });
    }

    // Archivos estáticos de public/
    const filePath =
      url.pathname === "/"
        ? path.join(__dirname, "public", "index.html")
        : path.join(__dirname, "public", path.normalize(url.pathname).replace(/^(\.\.(\/|\\|$))+/, ""));

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".js"
          ? "application/javascript; charset=utf-8"
          : ext === ".css"
          ? "text/css; charset=utf-8"
          : "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      return fs.createReadStream(filePath).pipe(res);
    }

    sendJson(res, 404, { error: "Ruta no encontrada" });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const server = createLabServer();
  server.listen(PORT, () => {
    console.log(`Encargo Auditor & Fixer Lab escuchando en http://localhost:${PORT}`);
  });
}
