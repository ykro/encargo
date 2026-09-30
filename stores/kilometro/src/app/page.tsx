// Catalog page, rendered on the server: name, price, terrain and delivery are text.
import { listProducts } from "@/shared/db";
import { deliveryLabel, formatUsd } from "@/shared/catalog";

export const dynamic = "force-dynamic";

export default function Home() {
  const products = listProducts();
  return (
    <>
      <h1>Tenis de trail y de ruta</h1>
      <ul className="grid">
        {products.map((p) => (
          <li key={p.id} className="card">
            <a href={`/productos/${p.slug}`}>
              <img src={p.image} alt={p.name} width={400} height={300} />
              <h2>{p.name}</h2>
            </a>
            <p className="price">{formatUsd(p.priceCents)}</p>
            <p className="meta">
              {p.categoryLabel} · Envío gratis · {deliveryLabel(p)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
