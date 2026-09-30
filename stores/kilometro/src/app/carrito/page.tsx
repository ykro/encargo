import type { Metadata } from "next";
import { cartDetails } from "@/lib/cart";
import { placeOrder, removeFromCart } from "@/lib/actions";
import { priceLabel } from "@/components/Listing";
import { arrivalDate, longDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Carrito" };

type Props = { searchParams: Promise<{ agregado?: string; pedido?: string; error?: string }> };

const usd = (cents: number) => `${(cents / 100).toFixed(2)} USD`;

export default async function Cart({ searchParams }: Props) {
  const { agregado, pedido, error } = await searchParams;
  const lines = await cartDetails();
  const total = lines.reduce((n, l) => n + l.subtotalCents, 0);
  const latest = lines.length ? new Date(Math.max(...lines.map((l) => arrivalDate(l.product).getTime()))) : undefined;
  const added = lines.find((l) => l.variantId === agregado);

  return (
    <div className="wrap cart">
      <h1>Carrito</h1>

      <div aria-live="polite">
        {added && (
          <p className="notice ok fade-in">
            Agregaste {added.product.name}, talla {added.variant.size}.
          </p>
        )}
        {error === "agotado" && <p className="notice no">Esa talla se agotó. Elige otra en la ficha del producto.</p>}
        {pedido && (
          <div className="notice ok fade-in">
            <p>
              <strong>Pedido {pedido} confirmado.</strong> Te enviamos el detalle por correo.
            </p>
            <p className="muted">Demostración: el pago de personas es simulado y no mueve inventario.</p>
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        !pedido && (
          <div className="empty">
            <h2>Tu carrito está vacío</h2>
            <p>Elige un modelo y una talla; aquí verás el total y la fecha de entrega antes de pagar.</p>
            <p className="empty-actions">
              <a className="btn-secondary" href="/trail">
                Ver trail
              </a>
              <a className="btn-secondary" href="/ruta">
                Ver ruta
              </a>
            </p>
          </div>
        )
      ) : (
        <div className="cart-grid">
          <table className="cart-table">
            <caption className="sr-only">Artículos en el carrito</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Talla</th>
                <th scope="col" className="num">Cantidad</th>
                <th scope="col" className="num">Subtotal</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.variantId}>
                  <td>
                    <a href={`/productos/${l.product.slug}?talla=${l.variant.size}`}>{l.product.name}</a>
                    <span className="muted block">{priceLabel(l.product)} c/u</span>
                  </td>
                  <td>{l.variant.size}</td>
                  <td className="num">{l.qty}</td>
                  <td className="num">{usd(l.subtotalCents)}</td>
                  <td>
                    <form action={removeFromCart}>
                      <input type="hidden" name="variantId" value={l.variantId} />
                      <button type="submit" className="link-button">
                        Quitar<span className="sr-only"> {l.product.name}</span>
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <aside className="summary" aria-label="Resumen">
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{usd(total)}</dd>
              </div>
              <div>
                <dt>Envío</dt>
                <dd>Gratis</dd>
              </div>
              <div className="total">
                <dt>Total</dt>
                <dd>{usd(total)}</dd>
              </div>
            </dl>
            {latest && <p className="delivery-date">Llega el {longDate(latest)}</p>}
            <form action={placeOrder}>
              <button type="submit" className="btn-primary">
                Confirmar pedido
              </button>
            </form>
            <p className="muted small">Pago simulado (demostración). No se cobra dinero real.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
