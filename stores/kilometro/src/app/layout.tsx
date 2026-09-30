// Kilómetro — "Ficha técnica". Deliberately plain, carefully made: every fact a
// person reads is text in the HTML the server sends, and the same facts are
// published as data (JSON-LD, feed, UCP) for agents.
import type { Metadata, Viewport } from "next";
import { Public_Sans } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const publicSans = Public_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "Kilómetro — tenis para correr", template: "%s · Kilómetro" },
  description: "Tenis de trail y de ruta con envío en Guatemala. Precio, tallas y fecha de entrega, sin rodeos.",
  alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: "Catálogo de productos" }] } },
};

export const viewport: Viewport = { themeColor: "#FAFAF8", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-GT" className={publicSans.variable}>
      <body>
        <a className="skip" href="#contenido">
          Saltar al contenido
        </a>
        <Header />
        <main id="contenido">{children}</main>
        <footer className="site-footer">
          <div className="wrap footer-grid">
            <p>
              <strong>Kilómetro</strong> · Tenis para correr, sin rodeos. Guatemala.
            </p>
            <nav aria-label="Información">
              <a href="/envios">Envíos</a>
              <a href="/terminos">Términos</a>
              <a href="/feed.xml">Catálogo en datos (feed)</a>
              <a href="/.well-known/ucp">Perfil de comercio (UCP)</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
