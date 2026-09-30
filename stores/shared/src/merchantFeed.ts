// Product feed in Google Merchant Center format (RSS 2.0 + g: namespace).
// One <item> per size variant, grouped by item_group_id, with price,
// availability and shipping times — the whole catalog in one request.
import type { Product } from "./catalog";
import { productPath } from "./store";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function merchantFeedXml(products: Product[], baseUrl: string, storeName: string): string {
  const items = products.flatMap((p) =>
    p.variants.map((v) => {
      const link = `${baseUrl}${productPath(p.slug)}?talla=${v.size}`;
      return `    <item>
      <g:id>${esc(v.sku)}</g:id>
      <g:item_group_id>${esc(p.id)}</g:item_group_id>
      <g:title>${esc(`${p.name} — talla ${v.size}`)}</g:title>
      <g:description>${esc(p.description)}</g:description>
      <g:link>${esc(link)}</g:link>
      <g:image_link>${esc(`${baseUrl}${p.image}`)}</g:image_link>
      <g:brand>${esc(p.brand)}</g:brand>
      <g:mpn>${esc(v.id)}</g:mpn>
      <g:condition>new</g:condition>
      <g:availability>${v.stock > 0 ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${(p.priceCents / 100).toFixed(2)} ${p.currency}</g:price>
      <g:google_product_category>187</g:google_product_category>
      <g:product_type>${esc(`Calzado > Tenis > ${p.categoryLabel}`)}</g:product_type>
      <g:color>${esc(p.color)}</g:color>
      <g:size>${esc(v.size)}</g:size>
      <g:size_system>US</g:size_system>
      <g:gender>unisex</g:gender>
      <g:age_group>adult</g:age_group>
      <g:custom_label_0>${esc(p.category)}</g:custom_label_0>
      <g:min_handling_time>${p.shipping.handlingDays[0]}</g:min_handling_time>
      <g:max_handling_time>${p.shipping.handlingDays[1]}</g:max_handling_time>
      <g:shipping>
        <g:country>${esc(p.shipping.country)}</g:country>
        <g:service>Estándar</g:service>
        <g:price>${(p.shipping.rateCents / 100).toFixed(2)} ${p.currency}</g:price>
        <g:min_transit_time>${p.shipping.transitDays[0]}</g:min_transit_time>
        <g:max_transit_time>${p.shipping.transitDays[1]}</g:max_transit_time>
      </g:shipping>
    </item>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(storeName)}</title>
    <link>${esc(baseUrl)}</link>
    <description>${esc(`Catálogo de ${storeName}`)}</description>
${items.join("\n")}
  </channel>
</rss>
`;
}
