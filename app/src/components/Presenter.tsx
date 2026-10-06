"use client";
import { useEffect, useRef, useState } from "react";
import type { StoreRef } from "@/lib/config";
import { useElapsed, useRun, mmss } from "@/lib/useRun";
import { recordedDay, replayChannel, useReplay, type ReplayName, type ReplaySignature } from "@/lib/useReplay";
import { stagePost, useEnrolled, useStageStatus, type StageStatus } from "@/lib/stageClient";
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

type Mode = { kind: "live" } | { kind: "replay"; name: ReplayName };

export function Presenter({ stores, appHost }: { stores: StoreRef[]; appHost: string }) {
  // Opening this page is the whole talk-day checklist: it wakes every service, and after a long
  // idle period it starts from a clean slate (stock, no old errand, control mode off).
  const stage = useStageStatus({ autoReset: true });
  const [enrolled] = useEnrolled();
  const [override, setOverride] = useState<boolean | null>(null);
  const control = override ?? stage.status?.control ?? null;
  useEffect(() => setOverride(null), [stage.status?.control]);
  const [busy, setBusy] = useState<"reset" | "control" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "live" });
  const replay = mode.kind === "replay" ? mode : null;
  const latest = useLatestRunId();
  const live = useRun(replay ? undefined : latest.id);
  const recorded = useReplay(replay?.name ?? null, { waitForSignature: true });
  const run = replay ? recorded.run : live.run;
  const connection = replay ? "live" : live.connection;
  const id = replay ? (recorded.state === "ready" ? undefined : run.id) : latest.id;
  const checked = replay ? recorded.state !== "loading" : latest.checked;
  const shotSrc = (shot: string) => `/api/agent/screenshots/${shot}.jpg`;

  // The phone window (same Chrome) follows: it shows the recorded approval card, and its
  // passkey (or its explicit simulated signature) lets the replay continue.
  const showReplay = () => {
    const name: ReplayName = control ? "pulso-control" : "kilometro";
    replayChannel()?.postMessage({ type: "replay", name });
    setMode({ kind: "replay", name });
  };
  const backToLive = () => {
    replayChannel()?.postMessage({ type: "live" });
    setMode({ kind: "live" });
  };
  async function act(kind: "reset" | "control") {
    setBusy(kind);
    setActionError(null);
    const next = !control;
    const error = kind === "reset" ? await stagePost("reset") : await stagePost("control", { enabled: next });
    if (error) setActionError(error);
    else if (kind === "control") setOverride(next);
    else {
      setOverride(false);
      backToLive();
    }
    stage.refresh();
    setBusy(null);
  }

  const player = useRef(recorded);
  player.current = recorded;
  useEffect(() => {
    if (replay && recorded.state === "ready") player.current.start();
  }, [replay, recorded.state]);
  useEffect(() => {
    if (!replay) return;
    const channel = replayChannel();
    if (channel) {
      channel.onmessage = (m) => {
        const msg = typeof m.data === "string" ? { type: m.data } : m.data;
        if (msg.type === "signed") player.current.sign((msg.method as ReplaySignature) ?? "simulated");
      };
    }
    return () => channel?.close();
  }, [replay]);
  const elapsed = useElapsed(run.startedAt, run.finishedAt ?? (run.phase === "no_purchase" || run.phase === "failed" || run.phase === "rejected" ? Date.now() : undefined));
  const urlOf = (s: StoreRef) => run.stores.find((u) => storeName(stores, u) === s.name) ?? s.url;
  const idle = !id;
  // In a replay, the control mode shown is the recording's, not today's.
  const shownControl = replay ? recorded.controlMode : control;
  const running = !replay && (run.phase === "running" || run.phase === "awaiting_approval" || run.phase === "signing");
  // Honest timing: past 60 s live, the clock turns amber and the recorded run is offered.
  const slow = running && elapsed >= 60;
  const stuck = !replay && Boolean(id) && (run.phase === "failed" || connection === "lost");

  return (
    <main className={`presenter ${replay ? "is-replay" : ""}`}>
      {replay ? (
        <div className="p-replay-banner" role="status">
          REPETICIÓN GRABADA{recordedDay(recorded.recordedAt) ? ` EL ${recordedDay(recorded.recordedAt)!.toUpperCase()}` : ""} · no es en vivo
          <small>{recorded.state === "waiting_signature" ? "esperando la firma en el teléfono" : "se reproduce con su tiempo original"}</small>
          {recorded.state === "waiting_signature" ? (
            <button type="button" className="p-btn" onClick={() => player.current.sign("simulated")}>Continuar con firma simulada</button>
          ) : null}
          <button type="button" className="p-btn" onClick={backToLive}>Volver a lo en vivo</button>
        </div>
      ) : null}
      <header className="p-head">
        <div><Wordmark /></div>
        <div className={`errand ${run.errand ? "" : "empty"}`}>{run.errand ? run.errand.replace(/\.$/, "") : idle && checked ? "Esperando un encargo…" : "Conectando…"}</div>
        <button
          type="button"
          className={`p-control ${shownControl ? "on" : ""}`}
          aria-live="polite"
          aria-pressed={Boolean(shownControl)}
          disabled={Boolean(replay) || !enrolled || shownControl === null || busy !== null}
          onClick={() => act("control")}
          title={enrolled ? (shownControl ? "Apagar el modo de control" : "Encender el modo de control") : "Habilita este navegador desde el teléfono"}
        >
          <span>Modo de control</span>
          <strong>{shownControl === null ? "—" : shownControl ? "ENCENDIDO" : "APAGADO"}</strong>
          <span>{busy === "control" ? "cambiando…" : shownControl === null ? "sin datos" : shownControl ? "Pulso legible para agentes" : "Pulso opaco"}</span>
        </button>
        <div className={`clock num ${run.phase === "completed" ? "done" : ""} ${slow ? "slow" : ""}`} aria-label="Tiempo transcurrido">
          <span>{mmss(elapsed)}</span>
        </div>
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
                      <img src={hv.src ?? shotSrc(hv.screenshotId)} alt={`Captura de ${s.name} tal como la ve una persona`} />
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
              <Readiness status={stage.status} agentDown={stage.agentDown} appHost={appHost} />
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

      <FunnelStrip run={run} />

      <div className="p-status" aria-live="polite">
        {id && connection === "lost" ? <span className="tag">Reconectando…</span> : null}
        {actionError ? <span className="tag err" role="alert">{actionError}</span> : null}
        {!replay ? (
          // Plan B is always one click away; it turns amber when the live run is slow or stopped.
          <button type="button" className={`p-btn ${slow || stuck ? "p-btn-amber" : ""}`} onClick={showReplay}>Ver la ejecución grabada</button>
        ) : null}
        {!replay ? (
          <button type="button" className="p-btn" onClick={() => act("reset")} disabled={!enrolled || busy !== null} title={enrolled ? "Stock completo, sin pedidos, modo de control apagado" : "Habilita este navegador desde el teléfono"}>
            {busy === "reset" ? "Reiniciando…" : "Empezar de nuevo"}
          </button>
        ) : null}
      </div>
    </main>
  );
}

/** What the presenter sees before the first errand: everything waking up, then «Listo». */
function Readiness({ status, agentDown, appHost }: { status: StageStatus | null; agentDown: boolean; appHost: string }) {
  const store = (key: string) => status?.stores.find((s) => s.key === key);
  const items: { label: string; ok: boolean }[] = [
    { label: "Pulso", ok: Boolean(store("pulso")?.ok) },
    { label: "Kilómetro", ok: Boolean(store("kilometro")?.ok) },
    { label: "Agente y modelo", ok: Boolean(status && status.agent.model_warm && status.agent.browser_warm) },
    { label: "Passkey para firmar", ok: Boolean(status && status.passkeys > 0) },
  ];
  if (status?.ready) {
    return (
      <div className="p-idle">
        <strong>Envía un encargo desde la app</strong>
        <span>{appHost || "la app de Encargo"}</span>
      </div>
    );
  }
  return (
    <div className="p-idle p-ready" role="status">
      <strong>{agentDown ? "Despertando el agente…" : "Preparando la demo…"}</strong>
      <ul className="p-ready-list">
        {items.map((it) => (
          <li key={it.label} className={it.ok ? "ok" : ""}>
            <span className="dot" aria-hidden />
            {it.label}
            <span className="visually-hidden">{it.ok ? ": listo" : ": preparando"}</span>
          </li>
        ))}
      </ul>
      {status?.problems.filter((p) => !p.includes("no responde")).map((p) => <span key={p} className="p-ready-problem">{p}</span>)}
    </div>
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
  if (run.approval) return null; // from the approval on, the decision and approval cards take the space
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
          <span className="a-sub">{signatureText(run.signedWith)} · {(run.order.label ?? "").replace(/^Pedido /, "")} · {Math.round(run.elapsed ?? 0)}{"\u00a0"}s</span>
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
        <span>
          {store.name}
          {offer && fields > 0 ? <span className="model"> · {offer.product?.replace(/^Senda /, "")}</span> : null}
        </span>
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

/** Never claims a passkey unless one signed: live passkey, test signer, or a replay's real/simulated approval. */
function signatureText(method?: string): string {
  if (method === "passkey") return "Mandato AP2 firmado con passkey";
  if (method === "simulated") return "Firma simulada (grabación)";
  if (method === "test") return "Mandato AP2 firmado con el firmador de prueba";
  return "Mandato AP2 firmado";
}

const HUMAN_PATH = ["portada", "catálogo", "producto", "talla", "carrito", "login", "checkout"];
const AGENT_PATH = ["perfil / feed", "carrito", "mandato"];

/** The funnel collapses: seven screens for a person, three machine steps for the agent, filling in live. */
function FunnelStrip({ run }: { run: RunView }) {
  const readData = Object.values(run.agentView).some((v) => v.sources?.ucp || v.sources?.feed || v.offerSources.length > 0);
  const done = [readData, Boolean(run.checkout), run.phase === "signing" || run.phase === "completed"];
  const current = done.findIndex((d) => !d);
  const active = run.phase !== "idle" && run.phase !== "no_purchase" && run.phase !== "failed" && run.phase !== "rejected";
  return (
    <section className="p-funnel" aria-label="El embudo: el camino de una persona frente al del agente">
      <div className="lane human">
        <span className="who">Persona</span>
        <ol>{HUMAN_PATH.map((s, i) => <Step key={s} first={i === 0}><li>{s}</li></Step>)}</ol>
        <span className="count num">7 pasos</span>
      </div>
      <div className="lane agent">
        <span className="who">Agente</span>
        <ol>
          {AGENT_PATH.map((s, i) => (
            <Step key={s} first={i === 0}>
              <li className={done[i] ? "done" : active && i === current ? "now" : ""}>
                {done[i] ? <Check size={20} /> : null}
                {s}
              </li>
            </Step>
          ))}
        </ol>
        <span className="count num">3 pasos</span>
      </div>
    </section>
  );
}

function Step({ first, children }: { first: boolean; children: React.ReactNode }) {
  return (
    <>
      {first ? null : <li className="arrow" aria-hidden>→</li>}
      {children}
    </>
  );
}
