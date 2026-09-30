import type { Metadata } from "next";

export const metadata: Metadata = { title: "Envíos" };

export default function Shipping() {
  return (
    <div className="wrap prose">
      <h1>Envíos</h1>
      <p className="lead">Enviamos a toda Guatemala. El envío es gratis en todos los modelos.</p>
      <h2>Cuándo llega</h2>
      <p>
        Cada ficha dice la fecha exacta: hoy más los días de preparación y de tránsito del modelo, contados en días hábiles
        (lunes a viernes, hora de Guatemala). Los pedidos no se preparan ni viajan en fin de semana.
      </p>
      <table className="specs">
        <caption className="sr-only">Ejemplos de plazos</caption>
        <thead>
          <tr>
            <th scope="col">Plazo publicado</th>
            <th scope="col">Si compras el lunes</th>
            <th scope="col">Si compras el jueves</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1 día hábil</td>
            <td>martes</td>
            <td>viernes</td>
          </tr>
          <tr>
            <td>2 días hábiles</td>
            <td>miércoles</td>
            <td>lunes</td>
          </tr>
          <tr>
            <td>3 días hábiles</td>
            <td>jueves</td>
            <td>martes</td>
          </tr>
        </tbody>
      </table>
      <h2>Para agentes de compra</h2>
      <p>
        Los mismos plazos están publicados como datos: en cada ficha (schema.org <code>shippingDetails</code>), en el{" "}
        <a href="/feed.xml">catálogo de productos</a> y en el <a href="/.well-known/ucp">perfil de comercio UCP</a>. Un
        agente puede comprar por ti solo con tu autorización firmada (mandato AP2).
      </p>
    </div>
  );
}
