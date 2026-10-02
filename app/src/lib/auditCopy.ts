// The audit as the talk's practical checklist, in business language: what it
// is, why an agent needs it, and how to fix it. The agent's technical evidence
// stays one click away.
export interface AuditCopy {
  title: string;
  what: string;
  why: string;
  fix: string;
}

export const AUDIT_COPY: Record<string, AuditCopy> = {
  structured_data: {
    title: "Tus productos se leen como datos",
    what: "Cada página de producto describe en código (schema.org) el nombre, el precio y la moneda.",
    why: "Un agente no interpreta banners ni fotos: si el precio no está en datos, no puede comprobarlo y no compra.",
    fix: "Agrega JSON-LD Product con Offer (price, priceCurrency) en cada ficha; la mayoría de plataformas lo trae como opción.",
  },
  availability: {
    title: "Se sabe qué tallas hay",
    what: "Cada talla o variante dice si está disponible o agotada.",
    why: "El encargo pide una talla concreta; sin disponibilidad por talla, el agente no puede prometerla.",
    fix: "Publica una variante por talla con availability (InStock / OutOfStock) y mantenla sincronizada con tu inventario.",
  },
  delivery: {
    title: "La fecha de entrega se puede calcular",
    what: "Los días de preparación y de envío están publicados como datos, no solo en el checkout.",
    why: "«Que llegue antes del viernes» es una condición; si la fecha aparece solo al pagar, el agente no la puede verificar antes.",
    fix: "Publica shippingDetails (handlingTime + transitTime) en la ficha o g:shipping con tiempos en tu feed.",
  },
  feed: {
    title: "Tu catálogo cabe en un archivo",
    what: "Un feed de productos (formato Merchant Center) con todo el catálogo, precios y existencias.",
    why: "El agente no navega tu tienda página por página: lee el feed y compara en segundos.",
    fix: "Genera /feed.xml (RSS con espacio de nombres g:) desde tu plataforma o tu ERP y actualízalo a diario.",
  },
  ucp_profile: {
    title: "Te presentas a los agentes",
    what: "Un perfil de comercio (/.well-known/ucp) que dice qué puede hacer un agente en tu tienda y dónde.",
    why: "Es la puerta de entrada: sin perfil, el agente no sabe que existe un catálogo ni un checkout para él.",
    fix: "Publica /.well-known/ucp con el servicio de compras, sus endpoints y tu llave de firma.",
  },
  checkout_api: {
    title: "Un agente puede armar la compra",
    what: "Un checkout por API: crear el carrito, ver el total y completar el pago.",
    why: "Sin API, el agente tendría que llenar formularios pensados para personas, con login y captchas.",
    fix: "Expón /checkout-sessions (crear y completar) siguiendo UCP y decláralo en tu perfil.",
  },
  payment_authorization: {
    title: "La persona autoriza el pago, no el agente",
    what: "Exiges un mandato firmado por la persona (AP2) y firmas tus propios términos.",
    why: "Es lo que da confianza a todos: el agente propone, la persona firma, y nadie puede cambiar el carrito en el camino.",
    fix: "Activa la extensión AP2 Mandates: firma cada checkout y rechaza pagos sin mandato válido.",
  },
  server_rendered: {
    title: "Lo esencial está sin JavaScript",
    what: "El HTML que envía tu servidor ya trae nombre, precio y disponibilidad.",
    why: "Muchos lectores automáticos no ejecutan JavaScript; si tu página llega vacía, para ellos no tienes productos.",
    fix: "Renderiza en el servidor (SSR) las fichas y el catálogo, aunque la experiencia visual siga en el navegador.",
  },
};
