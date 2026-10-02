"use client";
// Pulso's order permalink (control-mode purchases): a thank-you, rendered in the browser like the rest of the store.
import { ClientOnly } from "@/components/ClientOnly";
import { Page } from "@/components/Chrome";
import { StateMessage } from "@/components/StateMessage";

export default function PulsoOrder() {
  return (
    <ClientOnly>
      <Page>
        <StateMessage
          title="Tu pedido va en camino"
          text="Gracias por subir con Pulso. Pago simulado: no se cobró dinero real."
          action={{ href: "/", label: "Volver a la colección" }}
        />
      </Page>
    </ClientOnly>
  );
}
