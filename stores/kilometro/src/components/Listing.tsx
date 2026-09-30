// A product list as rows (a spec sheet, not a gallery): photo, name, price,
// availability for the chosen size, and the date it arrives.
import { listProducts } from "@/shared/db";
import type { Category, Product } from "@/shared/catalog";
import { arrivalLabel } from "@/lib/dates";

export interface ListingParams {
  q?: string;
  talla?: string;
  max?: string;
}

const SIZES = ["7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12"];
const PRICES = ["100", "150", "200"];

export function priceLabel(p: Product) {
  return `${(p.priceCents / 100).toFixed(2)} USD`;
}

function hrefWith(base: string, params: ListingParams, change: Partial<ListingParams>) {
  const next = { ...params, ...change };
  const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
  return qs ? `${base}?${qs}` : base;
}

function availability(p: Product, talla?: string) {
  if (talla) {
    const v = p.variants.find((x) => x.size === talla);
    if (!v) return { ok: false, text: `Sin talla ${talla} en este modelo` };
    return v.stock > 0 ? { ok: true, text: `Talla ${talla} en stock` } : { ok: false, text: `Talla ${talla} agotada` };
  }
  const n = p.variants.filter((v) => v.stock > 0).length;
  return n > 0 ? { ok: true, text: `${n} ${n === 1 ? "talla disponible" : "tallas disponibles"}` } : { ok: false, text: "Agotado" };
}

export function Listing({
  title,
  base,
  category,
  params,
}: {
  title: string;
  base: string;
  category?: Category;
  params: ListingParams;
}) {
  const q = params.q?.trim().toLowerCase();
  const max = params.max ? Number(params.max) * 100 : undefined;
  const products = listProducts().filter(
    (p) =>
      (!category || p.category === category) &&
      (!max || p.priceCents < max) &&
      (!q || `${p.name} ${p.description} ${p.categoryLabel} ${p.color}`.toLowerCase().includes(q)),
  );
  const talla = params.talla && SIZES.includes(params.talla) ? params.talla : undefined;

  return (
    <div className="wrap listing">
      <h1>{title}</h1>
      {params.q && (
        <p className="lead">
          Resultados para «{params.q}» · <a href={hrefWith(base, params, { q: undefined })}>quitar búsqueda</a>
        </p>
      )}

      <form className="filters" method="get" action={base} aria-label="Filtrar">
        {params.q && <input type="hidden" name="q" value={params.q} />}
        <label>
          <span>Talla (US)</span>
          <select name="talla" defaultValue={talla ?? ""}>
            <option value="">Todas</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Precio (USD)</span>
          <select name="max" defaultValue={params.max ?? ""}>
            <option value="">Cualquiera</option>
            {PRICES.map((p) => (
              <option key={p} value={p}>
                Menos de {p}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-secondary">
          Aplicar
        </button>
      </form>

      {(talla || params.max) && (
        <ul className="chips" aria-label="Filtros activos">
          {talla && (
            <li>
              <a className="chip" href={hrefWith(base, params, { talla: undefined })} aria-label={`Quitar filtro talla ${talla}`}>
                Talla {talla} <span aria-hidden="true">×</span>
              </a>
            </li>
          )}
          {params.max && (
            <li>
              <a className="chip" href={hrefWith(base, params, { max: undefined })} aria-label={`Quitar filtro menos de ${params.max} USD`}>
                Menos de {params.max} USD <span aria-hidden="true">×</span>
              </a>
            </li>
          )}
        </ul>
      )}

      {products.length === 0 ? (
        <div className="empty">
          <h2>No hay tenis con esos filtros</h2>
          <p>Prueba con otra talla, un precio más alto o una búsqueda más corta.</p>
          <a className="btn-secondary" href={base}>
            Ver todo {category ? (category === "trail" ? "trail" : "ruta") : "el catálogo"}
          </a>
        </div>
      ) : (
        <>
          <p className="count-line">
            {products.length} {products.length === 1 ? "modelo" : "modelos"}
          </p>
          <ol className="rows">
            {products.map((p) => {
              const a = availability(p, talla);
              const href = `/productos/${p.slug}${talla ? `?talla=${talla}` : ""}`;
              return (
                <li key={p.id} className="row">
                  <a href={href} className="row-photo" tabIndex={-1} aria-hidden="true">
                    <img src={p.image} alt="" width={240} height={180} loading="lazy" />
                  </a>
                  <div className="row-body">
                    <h2>
                      <a href={href}>{p.name}</a>
                    </h2>
                    <p className="price">{priceLabel(p)}</p>
                    <p className={a.ok ? "stock ok" : "stock no"}>{a.text}</p>
                    <p className="arrival">
                      {arrivalLabel(p)}
                      {!category && <span className="muted"> · {p.categoryLabel}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
