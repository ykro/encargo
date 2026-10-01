"use client";
import { useEffect, useState } from "react";
import type { StoreRef } from "@/lib/config";
import { useElapsed, useRun, mmss } from "@/lib/useRun";
import { focusOffer, humanDate, readableFields, SHORT_LABEL, STATUS_TEXT, type RunView } from "@/lib/runState";
import { parseItem, storeName } from "@/lib/names";
import { Wordmark } from "./Logo";
import { Check, Cross, Dash, Key } from "./Icons";

/** Follows the most recent run: the phone starts it, the stage shows it. */
function useLatestRunId(): { id?: string; checked: boolean } {
  const [id, setId] = useState<string>();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/agent/runs/latest", { cache: "no-store" });
        if (res.ok) {
          const run = await res.json();
          if (alive) setId((prev) => (prev === run.id ? prev : run.id));
        } else if (res.status === 404 && alive) setId(undefined);
      } catch {
        /* keep the last state on screen; the next poll retries */
      }
      if (alive) setChecked(true);
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return { id, checked };
}

function useControlMode(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/control").then((r) => r.json()).then((b) => setOn(b.pulsoAgentReady)).catch(() => setOn(null));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  return on;
}

export function Presenter({ stores, appHost }: { stores: StoreRef[]; appHost: string }) {
  const { id, checked } = useLatestRunId();
  const { run, connection } = useRun(id);
  const control = useControlMode();
  const elapsed = useElapsed(run.startedAt, run.finishedAt ?? (run.phase === "no_purchase" || run.phase === "failed" || run.phase === "rejected" ? Date.now() : undefined));
  const urlOf = (s: StoreRef) => run.stores.find((u) => storeName(stores, u) === s.name) ?? s.url;
  const idle = !id;

  return (
    <main className="presenter">
      <header className="p-head">
        <div><Wordmark /></div>
        <div className={`errand ${run.errand ? "" : "empty"}`}>{run.errand ? run.errand.replace(/\.$/, "") : idle && checked ? "Esperando un encargo…" : "Conectando…"}</div>
        <div className={`clock num ${run.phase === "completed" ? "done" : ""}`} aria-label="Tiempo transcurrido">{mmss(elapsed)}</div>
      </header>

      <div className="p-cols">
        <section className="p-col" aria-labelledby="c1">
          <h2 className="p-col-head" id="c1"><span className="p-num">01</span>Lo que ve una persona</h2>
          <div className="p-body">
            {stores.map((s) => {
              const hv = run.humanView[urlOf(s)];
              return (
                <figure className="shot" key={s.key} style={{ margin: 0 }}>
                  <div className="shot-frame">
                    {hv ? (
                      <img src={`/api/agent/screenshots/${hv.screenshotId}.jpg`} alt={`Captura de ${s.name} tal como la ve una persona`} />
                    ) : (
                      <div className="shot-empty">{idle ? "La captura aparece cuando empieza el encargo" : <span className="skeleton" style={{ width: "80%", height: "70%", display: "block" }} />}</div>
                    )}
                  </div>
                  <figcaption className="shot-name">{s.name}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>

        <section className="p-col" aria-labelledby="c2">
          <h2 className="p-col-head" id="c2"><span className="p-num">02</span>Razonamiento</h2>
          <div className="p-body">
            {idle ? (
              <div className="p-idle">
                <strong>Envía un encargo desde la app</strong>
                <span>{appHost || "la app de Encargo"}</span>
              </div>
            ) : (
              <>
                <Matrix run={run} stores={stores} urlOf={urlOf} />
                <Ticker run={run} stores={stores} />
                <Outcome run={run} stores={stores} />
              </>
            )}
          </div>
        </section>

        <section className="p-col" aria-labelledby="c3">
          <h2 className="p-col-head" id="c3"><span className="p-num">03</span>Lo que ve el agente</h2>
          <div className="p-body">
            {stores.map((s) => <AgentView key={s.key} run={run} store={s} url={urlOf(s)} idle={idle} />)}
          </div>
        </section>
      </div>

      <div className="p-status" aria-live="polite">
        {control !== null ? <span className={`tag ${control ? "on" : ""}`}>{control ? "Control: Pulso legible para agentes" : "Control apagado"}</span> : null}
        {id && connection === "lost" ? <span className="tag">Reconectando…</span> : null}
      </div>
    </main>
  );
}

function Matrix({ run, stores, urlOf }: { run: RunView; stores: StoreRef[]; urlOf: (s: StoreRef) => string }) {
  return (
    <table className="matrix">
      <caption className="visually-hidden">Condiciones del encargo por tienda</caption>
      <thead>
        <tr>
          <th scope="col"><span className="visually-hidden">Condición</span></th>
          {stores.map((s) => <th scope="col" key={s.key}>{s.name}</th>)}
        </tr>
      </thead>
      <tbody>
        {run.conditions.map((c) => (
          <tr key={c.id}>
            <td className="cond">{SHORT_LABEL[c.kind](c)}</td>
            {stores.map((s) => {
              const url = urlOf(s);
              const check = run.checklist[url]?.[c.id];
              const active = !check && run.activeStore === url && run.phase === "running";
              return (
                <td key={s.key} className={`state ${check?.status ?? "pending"} ${active ? "active" : ""}`} title={check?.evidence}>
                  {check ? (
                    <div>
                      <span className="badge">{check.status === "met" ? <Check size={32} /> : check.status === "not_met" ? <Cross size={32} /> : <Dash size={32} />}</span>
                      <span className="state-text">{STATUS_TEXT[check.status]}</span>
                    </div>
                  ) : <span className="visually-hidden">pendiente</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Ticker({ run, stores }: { run: RunView; stores: StoreRef[] }) {
  const lines = run.steps.filter((s) => s.kind !== "thought" || s.text.length < 160).slice(run.approval ? -1 : -3);
  return (
    <ol className="ticker" aria-live="polite">
      {lines.map((s) => (
        <li key={s.seq}>
          <span>{s.store ? `${storeName(stores, s.store)} · ` : ""}{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

function Outcome({ run, stores }: { run: RunView; stores: StoreRef[] }) {
  const a = run.approval;
  if (run.phase === "failed" && a) {
    // Designed failure after approval: the decision stands, the payment did not happen.
    return (
      <>
        <div className="decision"><span>Decisión: {storeName(stores, a.store)} · {a.total_amount !== undefined ? `${a.total_amount.toFixed(0)} USD` : a.total}</span></div>
        <div className="approval failed" role="alert">
          <span className="a-title"><Cross size={36} />La tienda no completó el pago</span>
          <span className="a-sub">{run.error ?? "Sin respuesta de la tienda."} · No se cobró nada.</span>
        </div>
      </>
    );
  }
  if (run.phase === "failed") return <div className="decision failed">El encargo se detuvo<small>{run.error ?? ""}</small></div>;
  if (run.phase === "no_purchase") return <div className="decision none">Sin compra: ninguna tienda cumple todo lo verificable</div>;
  if (run.phase === "rejected") return <div className="decision none">Compra cancelada: no se firmó el mandato</div>;
  if (!a) return null;
  const store = storeName(stores, a.store);
  const item = parseItem(a.items?.[0]);
  const amount = a.total_amount !== undefined ? `${a.total_amount.toFixed(0)} USD` : a.total;
  return (
    <>
      <div className="decision">
        <span>Decisión: {store} · {amount}</span>
      </div>
      {run.phase === "completed" && run.order ? (
        <div className="approval done">
          <span className="a-title"><Check size={36} />Pedido confirmado</span>
          <span className="a-sub">Mandato AP2 firmado con passkey · {(run.order.label ?? "").replace(/^Pedido /, "")} · {Math.round(run.elapsed ?? 0)}{"\u00a0"}s</span>
        </div>
      ) : (
        <div className="approval waiting">
          <span className="a-title"><Key size={36} />{run.phase === "signing" ? "Firmado · la tienda confirma el pago…" : "Esperando tu firma con passkey"}</span>
          <span className="a-sub">{item.product.replace(/^Senda /, "")} · talla {item.size} · llega {humanDate(a.latest_delivery)}</span>
        </div>
      )}
    </>
  );
}

function AgentView({ run, store, url, idle }: { run: RunView; store: StoreRef; url: string; idle: boolean }) {
  const av = run.agentView[url];
  const offer = focusOffer(run, url);
  const fields = readableFields(offer);
  const sizeCond = run.conditions.find((c) => c.kind === "size");
  const src = av?.sources;
  const jsonld = src?.jsonld || (av?.pages ?? []).some((p) => p.jsonld_products > 0) || av?.offerSources.some((s) => s.includes("JSON-LD"));
  const checked = Object.keys(run.checklist[url] ?? {}).length > 0;

  return (
    <div className="av-store">
      <h3>
        {store.name}
        {checked ? <span className="fields num">{fields} {fields === 1 ? "campo legible" : "campos legibles"}</span> : null}
      </h3>
      {src ? (
        <div className="av-sources" aria-label="Fuentes legibles por máquinas">
          <span className={`av-src ${src.ucp ? "on" : ""}`}>{src.ucp ? <Check size={16} /> : <Dash size={16} />}Perfil UCP</span>
          <span className={`av-src ${src.feed ? "on" : ""}`}>{src.feed ? <Check size={16} /> : <Dash size={16} />}Feed</span>
          <span className={`av-src ${jsonld ? "on" : ""}`}>{jsonld ? <Check size={16} /> : <Dash size={16} />}schema.org</span>
        </div>
      ) : idle ? null : (
        <div className="skeleton" style={{ height: 34, width: "70%" }} />
      )}
      {offer && fields > 0 ? (
        <dl className="av-table">
          <div><dt>modelo</dt><dd>{offer.product?.replace(/^Senda /, "")}</dd></div>
          <div><dt>precio</dt><dd className="num">{offer.price ?? "—"}</dd></div>
          <div><dt>talla {sizeCond?.value}</dt><dd>{offer.sizes_in_stock ? (offer.sizes_in_stock.includes(sizeCond?.value ?? "") ? "en stock" : "agotada") : "—"}</dd></div>
          <div><dt>entrega</dt><dd>{humanDate(offer.arrives_by) ?? "—"}</dd></div>
        </dl>
      ) : checked ? (
        <p className="av-empty"><strong>0 campos legibles.</strong> Precio, talla y entrega solo existen dentro de imágenes o después de iniciar sesión.</p>
      ) : av?.pages.length ? (
        <p className="av-empty">Página sin datos: {av.pages.at(-1)!.visible_text_chars} caracteres de texto, {av.pages.at(-1)!.jsonld_products} productos en schema.org.</p>
      ) : av?.offers.length ? (
        <p className="av-empty"><strong className="num">{av.offers.length}</strong> productos legibles en {av.offerSources.join(" y ")}.</p>
      ) : null}
    </div>
  );
}
