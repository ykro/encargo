"use client";
// The practical checklist from the talk: how agent-ready is any store?
import { useState } from "react";
import type { StoreRef } from "@/lib/config";
import { Wordmark } from "./Logo";
import { Check, Cross } from "./Icons";

interface Item { key: string; label: string; ok: boolean; evidence: string; fix: string }
interface Report { url: string; score: number; total: number; items: Item[] }

export function AuditView({ stores }: { stores: StoreRef[] }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(target: string) {
    if (!target.trim()) return;
    setUrl(target);
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/agent/audit?url=${encodeURIComponent(target.trim())}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "No se pudo auditar esa tienda.");
      setReport(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="audit">
      <header>
        <a href="/" style={{ textDecoration: "none" }} aria-label="Encargo, inicio"><Wordmark /></a>
        <span className="hint" style={{ margin: 0 }}>Auditoría</span>
      </header>
      <h1>¿Tu tienda está lista para agentes?</h1>
      <p className="lede" style={{ color: "var(--muted)", fontSize: 18, margin: 0 }}>
        Revisamos lo que un agente puede leer sin adivinar: datos estructurados, feed, perfil de comercio, checkout y autorización de pago.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); run(url); }}>
        <label htmlFor="url" className="visually-hidden">Dirección de la tienda</label>
        <input id="url" className="text" type="url" inputMode="url" placeholder="https://tu-tienda.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Auditando…" : "Auditar"}</button>
      </form>
      <div className="quick" aria-label="Tiendas de la demo">
        {stores.map((s) => (
          <button key={s.key} type="button" onClick={() => run(s.url)}>Probar con {s.name}</button>
        ))}
      </div>

      {error ? <p className="notice notice-error" role="alert" style={{ marginTop: 24 }}>{error}</p> : null}
      {loading ? (
        <div aria-busy="true" style={{ marginTop: 40, display: "grid", gap: 12 }}>
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}
        </div>
      ) : null}
      {!report && !loading && !error ? (
        <p className="hint" style={{ marginTop: 40 }}>Escribe la dirección de una tienda o prueba con una de la demo. La auditoría solo lee: no crea carritos ni pedidos.</p>
      ) : null}

      {report ? (
        <section aria-live="polite">
          <div className="score">
            <b className="num">{report.score}/{report.total}</b>
            <span>{report.url}</span>
          </div>
          <ol>
            {report.items.map((i) => (
              <li key={i.key} className={i.ok ? "ok" : "no"}>
                <span className="mark" aria-label={i.ok ? "Cumple" : "No cumple"}>{i.ok ? <Check /> : <Cross />}</span>
                <div>
                  <h2>{i.label}</h2>
                  <p>{i.evidence}</p>
                  {i.fix ? <p className="fix">Qué hacer: {i.fix}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
