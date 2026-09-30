"use client";
// Product: the picture says what it is and what it costs; the contour line
// says which sizes are left. Nothing here is written down as data.
import { useState } from "react";
import { addToBag } from "./bag";
import { ClientOnly } from "./ClientOnly";
import { Page } from "./Chrome";
import { Loading } from "./Loading";
import { SizePicker } from "./SizePicker";
import { SmartImage } from "./SmartImage";
import { StateMessage } from "./StateMessage";
import { findItem } from "./vitrina";

export function ProductView({ slug }: { slug: string }) {
  return (
    <ClientOnly fallback={<Loading />}>
      <Page>
        <ProductBody reference={slug} />
      </Page>
    </ClientOnly>
  );
}

function ProductBody({ reference }: { reference: string }) {
  const item = findItem(reference);
  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  if (!item) {
    return (
      <StateMessage
        title="Este sendero se perdió en la niebla"
        text="El producto que buscas ya no está en la colección."
        action={{ href: "/#coleccion", label: "Volver a la colección" }}
      />
    );
  }
  const soldOut = item.sizes.every((s) => !s.available);
  return (
    <article className="product">
      <div className="product-media">
        <SmartImage src={item.image} priority />
      </div>
      <div className="product-side">
        <a className="back" href="/#coleccion">
          ← Colección
        </a>
        <h1 className="display">Siente cada paso</h1>
        {soldOut ? (
          <p className="hint">Este par se agotó. Vuelve pronto: la montaña siempre regresa.</p>
        ) : (
          <SizePicker
            sizes={item.sizes}
            selected={size}
            onSelect={(s) => {
              setSize(s);
              setAdded(false);
            }}
          />
        )}
        <button
          className="btn"
          disabled={!size || soldOut}
          onClick={() => {
            if (!size) return;
            addToBag({ ref: item.ref, size });
            setAdded(true);
          }}
        >
          {added ? "En tu bolsa" : "Añadir a la bolsa"}
        </button>
        <p className="hint" aria-live="polite">
          {added ? (
            <>
              Listo. <a href="/bolsa">Ver bolsa y pagar →</a>
            </>
          ) : size ? (
            ""
          ) : (
            "Elige una talla sobre la curva para continuar."
          )}
        </p>
        <ul className="promise">
          <li>Envío a todo Guatemala</li>
          <li>Cambios de talla sin costo</li>
          <li>Pago seguro al final de la compra</li>
        </ul>
      </div>
    </article>
  );
}
