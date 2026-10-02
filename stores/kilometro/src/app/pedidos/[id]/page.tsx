// Order page: the permalink the checkout returns (order.permalink_url). Plain
// text, like everything in Kilómetro: what was bought, for how much, and when it arrives.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { orderById } from "@/shared/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pedido" };

const usd = (cents: number) => `${(cents / 100).toFixed(2)} USD`;

export default async function Order({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = orderById(id);
  if (!order) notFound();
  const total = (order.totals as { type: string; amount: number }[]).find((t) => t.type === "total")?.amount ?? 0;
  return (
    <div className="wrap prose">
      <p className="eyebrow">Pedido confirmado</p>
      <h1>Pedido {id.slice(-6).toUpperCase()}</h1>
      <p className="lead">
        Pagado con un mandato firmado por la persona (AP2) y verificado por Kilómetro. El pago es simulado: no se cobró dinero real.
      </p>
      <table className="specs">
        <caption className="sr-only">Detalle del pedido</caption>
        <tbody>
          {(order.line_items as { id: string; item: { title: string; price: number }; quantity: number }[]).map((li) => (
            <tr key={li.id}>
              <th scope="row">{li.item.title}</th>
              <td>
                {li.quantity} × {usd(li.item.price)}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">Total</th>
            <td>{usd(total)}</td>
          </tr>
          <tr>
            <th scope="row">Fecha</th>
            <td>{new Date(order.created_at).toLocaleString("es-GT", { timeZone: "America/Guatemala", dateStyle: "long", timeStyle: "short" })}</td>
          </tr>
          <tr>
            <th scope="row">Autorización</th>
            <td>{order.mandate?.vct ?? "—"}</td>
          </tr>
        </tbody>
      </table>
      <p>
        <a href="/">Seguir viendo tenis</a>
      </p>
    </div>
  );
}
