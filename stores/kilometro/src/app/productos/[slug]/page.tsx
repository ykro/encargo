// Product page, rendered on the server, with schema.org JSON-LD: what the page
// says in words, it also says in data (price, stock per size, delivery time).
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { productBySlug } from "@/shared/db";
import { deliveryLabel, formatUsd } from "@/shared/catalog";
import { jsonLdScript, productJsonLd } from "@/shared/schemaOrg";
import { baseUrlFrom } from "@/shared/store";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = productBySlug(slug);
  if (!p) notFound();
  const base = baseUrlFrom(await headers());
  return (
    <article className="product">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(p, base, `/productos/${p.slug}`)) }}
      />
      <img src={p.image} alt={p.name} width={600} height={450} />
      <div>
        <h1>{p.name}</h1>
        <p className="price">{formatUsd(p.priceCents)}</p>
        <p>{p.description}</p>
        <p className="meta">
          Tipo: {p.categoryLabel} · Color: {p.color} · Marca: {p.brand}
        </p>
        <h2>Envío</h2>
        <p>
          Envío gratis a Guatemala. Entrega en {deliveryLabel(p)} (preparación {p.shipping.handlingDays.join("–")}, tránsito{" "}
          {p.shipping.transitDays.join("–")}).
        </p>
        <h2>Tallas (US)</h2>
        <table>
          <thead>
            <tr>
              <th>Talla</th>
              <th>Disponibilidad</th>
            </tr>
          </thead>
          <tbody>
            {p.variants.map((v) => (
              <tr key={v.id}>
                <td className={v.stock > 0 ? "" : "out"}>{v.size}</td>
                <td>{v.stock > 0 ? `Disponible (${v.stock})` : "Agotada"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
