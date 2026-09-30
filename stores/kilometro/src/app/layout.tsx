// Kilómetro: plain markup on purpose. The visual design comes later; what
// matters here is that every fact is in the HTML the server sends.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kilómetro — tenis para correr",
  description: "Tenis de trail y de ruta con envío en Guatemala.",
  alternates: { types: { "application/rss+xml": [{ url: "/feed.xml", title: "Catálogo de productos" }] } },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-GT">
      <body>
        <header className="site-header">
          <a href="/" className="brand">Kilómetro</a>
          <span className="tagline">Tenis para correr, sin rodeos.</span>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <a href="/feed.xml">Catálogo (feed)</a> · <a href="/.well-known/ucp">Perfil de comercio (UCP)</a> ·{" "}
          <a href="/terminos">Términos</a>
        </footer>
      </body>
    </html>
  );
}
