// Spanish 404 instead of Next's default English page.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="phone" style={{ justifyContent: "center", textAlign: "center" }}>
      <h1>Esta página no existe</h1>
      <p className="lede">Revisa la dirección o vuelve al inicio.</p>
      <p><Link className="btn btn-primary" href="/">Ir a Encargo</Link></p>
    </main>
  );
}
