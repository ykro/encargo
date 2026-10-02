import QRCode from "qrcode";
import { storesConfig } from "@/lib/config";
import { AuditView } from "@/components/AuditView";

export const dynamic = "force-dynamic";

export default async function Audit() {
  // The QR on stage takes the audience to this same page on their phones.
  const host = process.env.APP_PUBLIC_HOST ?? "localhost:3000";
  const url = `${host.startsWith("localhost") ? "http" : "https"}://${host}/auditoria`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0E1726", light: "#FCFCFD" } });
  return <AuditView stores={storesConfig()} qr={qr} pageUrl={url} />;
}
