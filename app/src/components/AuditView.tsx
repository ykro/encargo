"use client";
// The practical checklist from the talk: how agent-ready is any store?
// Business language first; the agent's technical evidence is one click away.
import { useState } from "react";
import type { StoreRef } from "@/lib/config";
import { AUDIT_COPY } from "@/lib/auditCopy";
import { Wordmark } from "./Logo";
import { Check, Cross } from "./Icons";

interface Item { key: string; label: string; ok: boolean; evidence: string; fix: string }
interface Report { url: string; score: number; total: number; items: Item[] }

function markdown(report: Report): string {
  const lines = [`# Checklist para agentes — ${report.url}`, "", `Puntaje: ${report.score}/${report.total}`, ""];
  for (const i of report.items) {
    const c = AUDIT_COPY[i.key];
    lines.push(`- [${i.ok ? "x" : " "}] **${c?.title ?? i.label}** — ${c?.what ?? ""}`);
    lines.push(`  - Por qué: ${c?.why ?? ""}`);
    if (!i.ok) lines.push(`  - Qué hacer: ${c?.fix ?? i.fix}`);
    lines.push(`  - Evidencia: ${i.evidence}`);
  }
  return lines.join("\n") + "\n";
}

export function AuditView({ stores, qr, pageUrl }: { stores: StoreRef[]; qr: string; pageUrl: string }) {
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

  function download() {
    if (!report) return;
    const blob = new Blob([markdown(report)], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "checklist-agentes.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="audit">
      <header>
        <a href="/" style={{ textDecoration: "none" }} aria-label="Encargo, inicio"><Wordmark /></a>
        <span className="hint" style={{ margin: 0 }}>Auditoría</span>
      </header>
      <div className="audit-intro">
        <div>
          <h1>¿Tu tienda está lista para agentes?</h1>
          <p className="lede">Ocho cosas que un agente necesita leer para comprarte sin adivinar. La auditoría solo lee: no crea carritos ni pedidos.</p>
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
        </div>
        <figure className="audit-qr">
          <div dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={`Código QR de ${pageUrl}`} />
          <figcaption>Audita tu tienda desde el teléfono</figcaption>
        </figure>
      </div>

      {error ? <p className="notice notice-error" role="alert" style={{ marginTop: 16 }}>{error}</p> : null}
      {loading ? (
        <div aria-busy="true" className="audit-grid" style={{ marginTop: 24 }}>
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}
        </div>
      ) : null}
      {!report && !loading && !error ? (
        <ol className="audit-grid preview" aria-label="Lo que revisa la auditoría">
          {Object.entries(AUDIT_COPY).map(([key, c]) => (
            <li key={key}>
              <span className="mark idle" aria-hidden>·</span>
              <div><h2>{c.title}</h2><p>{c.what}</p></div>
            </li>
          ))}
        </ol>
      ) : null}

      {report ? (
        <section aria-live="polite">
          <div className="score">
            <b className="num">{report.score}/{report.total}</b>
            <span>{report.url}</span>
            <span className="score-actions no-print">
              <button type="button" className="btn btn-quiet" onClick={() => window.print()}>Imprimir o guardar PDF</button>
              <button type="button" className="btn btn-quiet" onClick={download}>Descargar checklist</button>
            </span>
          </div>
          <ol className="audit-grid">
            {report.items.map((i) => {
              const c = AUDIT_COPY[i.key] ?? { title: i.label, what: "", why: "", fix: i.fix };
              return (
                <li key={i.key} className={i.ok ? "ok" : "no"}>
                  <span className="mark" aria-label={i.ok ? "Cumple" : "No cumple"}>{i.ok ? <Check /> : <Cross />}</span>
                  <div>
                    <h2>{c.title}</h2>
                    <p>{i.ok ? `Lo tiene. ${c.why}` : c.why}</p>
                    {!i.ok ? <p className="fix"><strong>Qué hacer:</strong> {c.fix}</p> : null}
                    <details>
                      <summary>Detalle técnico</summary>
                      <p>{c.what}</p>
                      <p className="mono">{i.label}: {i.evidence}</p>
                    </details>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
