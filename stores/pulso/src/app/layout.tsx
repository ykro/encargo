// Pulso renders everything in the browser. The server sends an empty shell;
// only in control mode does it also send machine-readable data.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Pulso", description: "Siente cada paso." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-GT">
      <body>{children}</body>
    </html>
  );
}
