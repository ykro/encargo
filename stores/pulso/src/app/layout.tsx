// Pulso renders everything in the browser. The server sends an empty shell;
// only in control mode does it also send machine-readable data.
import type { Metadata, Viewport } from "next";
import { Mulish, Tenor_Sans } from "next/font/google";
import "./globals.css";

const tenor = Tenor_Sans({ weight: "400", subsets: ["latin"], variable: "--font-tenor", display: "swap" });
const mulish = Mulish({ subsets: ["latin"], variable: "--font-mulish", display: "swap" });

export const metadata: Metadata = {
  title: "Pulso — sube más alto",
  description: "Siente cada paso.",
  icons: { icon: "/brand/logo.jpg" },
};

export const viewport: Viewport = { themeColor: "#E9EEF0", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-GT" className={`${tenor.variable} ${mulish.variable}`}>
      <body>{children}</body>
    </html>
  );
}
