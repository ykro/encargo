"use client";
// Pulso's checkout: the delivery date is revealed only here, at the very end,
// and only after signing in. Payment is simulated.
import { useState } from "react";
import vitrina from "@/vitrina.json";
import { ClientOnly } from "@/components/ClientOnly";
import { Header } from "@/components/Header";

function deliveryDate(businessDays: number): string {
  const d = new Date();
  let left = businessDays;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" });
}

export default function Checkout() {
  const [signedIn, setSignedIn] = useState(false);
  const [paid, setPaid] = useState(false);
  return (
    <ClientOnly>
      <Header />
      <CheckoutBody signedIn={signedIn} paid={paid} onSignIn={() => setSignedIn(true)} onPay={() => setPaid(true)} />
    </ClientOnly>
  );
}

function CheckoutBody(props: { signedIn: boolean; paid: boolean; onSignIn: () => void; onPay: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const item = vitrina.find((v) => v.ref === params.get("ref"));
  if (!item) return <p className="panel">Tu carrito está vacío.</p>;
  if (!props.signedIn) {
    return (
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSignIn();
        }}
      >
        <h1>Inicia sesión para continuar</h1>
        <input type="email" required placeholder="Correo" aria-label="Correo" />
        <input type="password" required placeholder="Contraseña" aria-label="Contraseña" />
        <button className="cta" type="submit">Entrar</button>
      </form>
    );
  }
  if (props.paid) return <p className="panel">¡Listo! Tu pedido va en camino.</p>;
  return (
    <div className="panel">
      <img src={item.image} alt="" />
      <p>Talla {params.get("t")}</p>
      <p>Llega el {deliveryDate(item.deliveryDays)}</p>
      <button className="cta" onClick={props.onPay}>Pagar (simulado)</button>
    </div>
  );
}
