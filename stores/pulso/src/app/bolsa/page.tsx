"use client";
// The bag. Lines are opaque references + the size the person picked.
import { Page } from "@/components/Chrome";
import { ClientOnly } from "@/components/ClientOnly";
import { Contours } from "@/components/Contours";
import { Loading } from "@/components/Loading";
import { SmartImage } from "@/components/SmartImage";
import { StateMessage } from "@/components/StateMessage";
import { useBag, writeBag } from "@/components/bag";
import { findItem } from "@/components/vitrina";

export default function Bag() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Page>
        <BagBody />
      </Page>
    </ClientOnly>
  );
}

function BagBody() {
  const lines = useBag().filter((l) => findItem(l.ref));
  if (lines.length === 0) {
    return (
      <StateMessage
        title="Tu bolsa está vacía"
        text="Elige un par y una talla; aquí te esperan hasta que estés listo para subir."
        action={{ href: "/#coleccion", label: "Explorar la colección" }}
      />
    );
  }
  return (
    <div className="narrow">
      <div className="section-head" style={{ marginTop: 24 }}>
        <div>
          <p className="eyebrow">Tu bolsa</p>
          <h1 className="display">Casi en la cima</h1>
        </div>
      </div>
      <div className="panel">
        <Contours seed={9} lines={6} />
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {lines.map((l) => (
            <li key={`${l.ref}-${l.size}`} className="bag-line">
              <SmartImage src={findItem(l.ref)!.image} />
              <span>Talla {l.size}</span>
              <button
                className="link-btn"
                onClick={() => writeBag(lines.filter((x) => !(x.ref === l.ref && x.size === l.size)))}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 28 }}>
          <a className="btn" href="/checkout">
            Continuar al pago
          </a>
        </div>
      </div>
    </div>
  );
}
