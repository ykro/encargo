"use client";
// Pulso's checkout: the delivery date is revealed only here, at the very end,
// and only after signing in. Payment is simulated.
import { useState } from "react";
import { Page } from "@/components/Chrome";
import { ClientOnly } from "@/components/ClientOnly";
import { Contours } from "@/components/Contours";
import { Loading } from "@/components/Loading";
import { SmartImage } from "@/components/SmartImage";
import { StateMessage } from "@/components/StateMessage";
import { useBag, writeBag } from "@/components/bag";
import { findItem } from "@/components/vitrina";

type Step = "sesion" | "entrega" | "listo";

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
  return (
    <ClientOnly fallback={<Loading />}>
      <Page>
        <CheckoutBody />
      </Page>
    </ClientOnly>
  );
}

const STEPS: { id: Step; label: string }[] = [
  { id: "sesion", label: "Sesión" },
  { id: "entrega", label: "Entrega y pago" },
  { id: "listo", label: "Listo" },
];

function CheckoutBody() {
  const lines = useBag().filter((l) => findItem(l.ref));
  const [step, setStep] = useState<Step>("sesion");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  if (step !== "listo" && lines.length === 0) {
    return (
      <StateMessage
        title="No hay nada que pagar"
        text="Tu bolsa está vacía. Elige un par para continuar."
        action={{ href: "/#coleccion", label: "Explorar la colección" }}
      />
    );
  }
  const slowest = Math.max(0, ...lines.map((l) => findItem(l.ref)!.deliveryDays));

  return (
    <div className="narrow">
      <div className="section-head" style={{ marginTop: 24 }}>
        <div>
          <p className="eyebrow">Pago</p>
          <h1 className="display">{step === "listo" ? "Nos vemos arriba" : "Último tramo"}</h1>
        </div>
      </div>
      <div className="panel">
        <Contours seed={13} lines={7} />
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.id} aria-current={s.id === step ? "step" : undefined}>
              {s.label}
            </li>
          ))}
        </ol>

        {step === "sesion" && (
          <form
            className="form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const email = String(data.get("correo") ?? "");
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !String(data.get("clave") ?? "")) {
                setError("Escribe un correo válido y tu contraseña.");
                return;
              }
              setError("");
              setStep("entrega");
            }}
          >
            <p style={{ margin: 0, color: "var(--muted)" }}>Inicia sesión para ver cuándo llega tu pedido.</p>
            <div className="field">
              <label htmlFor="correo">Correo</label>
              <input id="correo" name="correo" type="email" autoComplete="email" required aria-invalid={!!error} />
            </div>
            <div className="field">
              <label htmlFor="clave">Contraseña</label>
              <input id="clave" name="clave" type="password" autoComplete="current-password" required aria-invalid={!!error} />
            </div>
            <p className="error-text" role="alert">
              {error}
            </p>
            <button className="btn" type="submit">
              Entrar y continuar
            </button>
          </form>
        )}

        {step === "entrega" && (
          <div className="form">
            <div className="checkout-thumbs">
              {lines.map((l) => (
                <SmartImage key={`${l.ref}-${l.size}`} src={findItem(l.ref)!.image} />
              ))}
            </div>
            <div className="arrival">
              <span className="eyebrow">Llega el</span>
              <strong>{deliveryDate(slowest)}</strong>
              <span style={{ color: "var(--muted)" }}>
                {lines.length} {lines.length === 1 ? "par" : "pares"} · envío a Ciudad de Guatemala
              </span>
            </div>
            <button
              className="btn"
              disabled={paying}
              onClick={() => {
                setPaying(true);
                setTimeout(() => {
                  writeBag([]);
                  setStep("listo");
                }, 900);
              }}
            >
              {paying ? "Procesando…" : "Pagar (simulado)"}
            </button>
            <p className="hint" style={{ margin: 0 }}>
              Pago simulado: no se cobra dinero real.
            </p>
          </div>
        )}

        {step === "listo" && (
          <div className="form" role="status">
            <p style={{ margin: 0, fontSize: 20 }}>Tu pedido va en camino. Te escribiremos cuando salga de bodega.</p>
            <a className="btn ghost" href="/">
              Volver al inicio
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
