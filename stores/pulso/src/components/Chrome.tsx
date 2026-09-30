"use client";
// Page chrome: fog veil that lifts on load, masthead, footer.
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { bagCount, useBag } from "./bag";

export function Masthead() {
  const bag = useBag();
  const count = bagCount(bag);
  return (
    <header className="masthead">
      <Logo />
      <nav className="nav" aria-label="Principal">
        <a href="/#coleccion">Colección</a>
        <a href="/#historias" className="nav-secondary">
          Historias
        </a>
        <a href="/bolsa" className="bag-link" aria-label={count ? `Bolsa, ${count} artículo${count > 1 ? "s" : ""}` : "Bolsa, vacía"}>
          Bolsa
          {count > 0 && (
            <span className="bag-count" aria-hidden="true">
              {count}
            </span>
          )}
        </a>
      </nav>
    </header>
  );
}

export function FogVeil() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1200);
    return () => clearTimeout(t);
  }, []);
  return gone ? null : <div className="veil" aria-hidden="true" />;
}

export function Footer() {
  return (
    <footer className="footer">
      <span>Pulso · Ciudad de Guatemala</span>
      <span>Tienda ficticia para una demostración. Los pagos son simulados.</span>
    </footer>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FogVeil />
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <div className="frame">
        <Masthead />
        <main id="contenido">{children}</main>
        <Footer />
      </div>
    </>
  );
}
