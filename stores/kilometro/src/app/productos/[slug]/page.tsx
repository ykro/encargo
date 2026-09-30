// Product page, rendered on the server, with schema.org JSON-LD: what the page
// says in words (price, stock per size, delivery date), it also says in data.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { productBySlug } from "@/shared/db";
import { jsonLdScript, productJsonLd } from "@/shared/schemaOrg";
import { baseUrlFrom } from "@/shared/store";
import { priceLabel } from "@/components/Listing";
import { deliveryLabel } from "@/shared/catalog";
import { arrivalLabel, shippingLabel } from "@/lib/dates";
import { addToCart } from "@/lib/actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ talla?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = productBySlug((await params).slug);
  return p ? { title: p.name, description: p.description } : { title: "Producto no encontrado" };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { talla } = await searchParams;
  const p = productBySlug(slug);
  if (!p) notFound();
  const base = baseUrlFrom(await headers());
  const selected = p.variants.find((v) => v.size === talla);
  const inStock = p.variants.filter((v) => v.stock > 0);
  const categoryHref = p.category === "trail" ? "/trail" : "/ruta";

  let status: { ok: boolean; text: string };
  if (selected) status = selected.stock > 0 ? { ok: true, text: `Talla ${selected.size} en stock · ${selected.stock} ${selected.stock === 1 ? "par" : "pares"}` } : { ok: false, text: `Talla ${selected.size} agotada` };
  else status = inStock.length ? { ok: true, text: "En stock" } : { ok: false, text: "Agotado" };

  return (
    <div className="wrap product-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(p, base, `/productos/${p.slug}`)) }}
      />
      <nav aria-label="Ruta de navegación" className="breadcrumb">
        <ol>
          <li>
            <a href={categoryHref}>{p.categoryLabel}</a>
          </li>
          <li>
            <a href={`/?q=${encodeURIComponent(p.brand)}`}>{p.brand}</a>
          </li>
          <li aria-current="page">{p.name.replace(`${p.brand} `, "")}</li>
        </ol>
      </nav>

      <div className="product">
        <figure className="product-photo">
          <img src={p.image} alt={`${p.name}, vista lateral`} width={1200} height={900} />
        </figure>

        <section className="sheet" aria-labelledby="nombre">
          <h1 id="nombre">{p.name}</h1>
          <p className="price-lg">{priceLabel(p)}</p>
          <p className={status.ok ? "stock ok" : "stock no"}>
            <span className="dot" aria-hidden="true" />
            {status.text}
          </p>

          <fieldset className="sizes">
            <legend>Talla (US)</legend>
            <ul>
              {p.variants.map((v) =>
                v.stock > 0 ? (
                  <li key={v.id}>
                    <a
                      href={`?talla=${v.size}`}
                      className={v.size === talla ? "size selected" : "size"}
                      aria-current={v.size === talla ? "true" : undefined}
                      aria-label={`Talla ${v.size}${v.size === talla ? ", elegida" : ""}`}
                    >
                      {v.size}
                    </a>
                  </li>
                ) : (
                  <li key={v.id}>
                    <span className="size out" aria-label={`Talla ${v.size}, agotada`}>
                      {v.size}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </fieldset>

          <div className="delivery">
            <p className="delivery-date">{arrivalLabel(p)}</p>
            <p>
              {shippingLabel(p)} a toda Guatemala · entrega en {deliveryLabel(p)}
            </p>
          </div>

          <form action={addToCart}>
            <input type="hidden" name="variantId" value={selected?.id ?? ""} />
            <button type="submit" className="btn-primary" disabled={!selected || selected.stock < 1} aria-describedby="talla-ayuda">
              Agregar al carrito
            </button>
            {!selected && (
              <p id="talla-ayuda" className="hint">
                Elige una talla para agregarla al carrito.
              </p>
            )}
          </form>

          <table className="specs">
            <caption className="sr-only">Ficha técnica</caption>
            <tbody>
              <tr>
                <th scope="row">Terreno</th>
                <td>{p.categoryLabel}</td>
              </tr>
              {p.specs && (
                <>
                  <tr>
                    <th scope="row">Peso (talla 9)</th>
                    <td>{p.specs.weightG} g</td>
                  </tr>
                  <tr>
                    <th scope="row">Drop</th>
                    <td>{p.specs.dropMm} mm</td>
                  </tr>
                  <tr>
                    <th scope="row">Suela</th>
                    <td>{p.specs.outsole}</td>
                  </tr>
                </>
              )}
              <tr>
                <th scope="row">Color</th>
                <td>{p.color}</td>
              </tr>
              <tr>
                <th scope="row">SKU</th>
                <td>{selected?.sku ?? p.id}</td>
              </tr>
            </tbody>
          </table>

          <p className="description">{p.description}</p>
        </section>
      </div>
    </div>
  );
}
