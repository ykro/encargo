import type { Metadata } from "next";

export const metadata: Metadata = { title: "Términos" };

export default function Terms() {
  return (
    <div className="wrap prose">
      <h1>Términos</h1>
      <p className="lead">Kilómetro es una tienda ficticia creada para una demostración.</p>
      <ul>
        <li>Los productos, la marca Senda y los precios son inventados.</li>
        <li>Los pagos son simulados (sandbox): no se cobra dinero real ni se piden tarjetas.</li>
        <li>Las compras hechas por un agente requieren un mandato AP2 firmado por la persona.</li>
      </ul>
    </div>
  );
}
