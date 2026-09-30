"use client";
// Home: a misty summit, then the collection as an editorial mosaic. Every name
// and price lives inside the pictures; the page itself states no product facts.
import { ClientOnly } from "@/components/ClientOnly";
import { Page } from "@/components/Chrome";
import { Contours } from "@/components/Contours";
import { Loading } from "@/components/Loading";
import { SmartImage } from "@/components/SmartImage";
import { vitrina } from "@/components/vitrina";

export default function Home() {
  return (
    <ClientOnly fallback={<Loading />}>
      <Page>
        <section className="hero" aria-label="Destacado">
          <a className="hero-link" href={`/p/${vitrina.heroRef}`} aria-label="Ver el tenis destacado">
            <SmartImage src={vitrina.hero ?? vitrina.items[0].image} priority />
          </a>
          <a className="hero-cta" href={`/p/${vitrina.heroRef}`}>
            Descúbrelo <span aria-hidden="true">→</span>
          </a>
        </section>

        <div className="section-head" id="coleccion">
          <div>
            <p className="eyebrow">Colección otoño</p>
            <h1 className="display">Hecho para la bruma</h1>
          </div>
          <p className="lede">Diez pares para madrugar, subir y volver con la ropa empapada de nube.</p>
        </div>

        <ul className="mosaic">
          {vitrina.items.map((item, i) => (
            <li key={item.ref}>
              <a className="tile" href={`/p/${item.ref}`} aria-label={`Ver producto ${i + 1} de ${vitrina.items.length}`}>
                <SmartImage src={item.image} />
              </a>
            </li>
          ))}
        </ul>

        <section className="story" id="historias" aria-labelledby="historias-titulo">
          <Contours seed={5} lines={9} squash={0.5} draw />
          <div>
            <p className="eyebrow">Historias</p>
            <h2 className="display" id="historias-titulo">
              La montaña no se apura
            </h2>
          </div>
          <div>
            <p>
              Salimos antes del amanecer, cuando la neblina todavía cubre los barrancos y el único sonido es la
              respiración. Diseñamos cada par pensando en ese momento: el primer paso sobre piedra húmeda.
            </p>
            <p>Pulso nace en Guatemala, entre volcanes. Corre despacio, mira lejos, sube más alto.</p>
          </div>
        </section>
      </Page>
    </ClientOnly>
  );
}
