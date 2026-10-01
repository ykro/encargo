"use client";
// Phone, steps 2–4: follow the errand live, then authorize the purchase with a
// passkey. The signature is over a challenge derived from the store-signed
// checkout, so it approves exactly this cart and nothing else.
import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { StoreRef } from "@/lib/config";
import { useRun } from "@/lib/useRun";
import { humanDate, SHORT_LABEL, STATUS_TEXT, type RunView } from "@/lib/runState";
import { parseItem, storeName } from "@/lib/names";
import { PhoneTop } from "./PhoneTop";
import { Check, Cross, Dash, Key } from "./Icons";

type SignState = "idle" | "waiting" | "sending" | "error";

export function RunPhone({ runId, stores }: { runId: string; stores: StoreRef[] }) {
  const { run, connection } = useRun(runId);
  const [sign, setSign] = useState<SignState>("idle");
  const [signError, setSignError] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/agent/passkeys/status")
      .then((r) => r.json())
      .then((b) => setPasskeys(b.registered ?? 0))
      .catch(() => setPasskeys(null));
  }, []);

  async function approve() {
    const mid = run.approval?.mandate_id;
    if (!mid) return;
    setSign("waiting");
    setSignError(null);
    try {
      const optRes = await fetch(`/api/agent/mandates/${mid}/passkey-options`, { method: "POST" });
      const opt = await optRes.json();
      if (!optRes.ok) throw new Error(opt.detail ?? "No se pudo preparar la firma.");
      const credential = await startAuthentication({ optionsJSON: JSON.parse(opt.options) });
      setSign("sending");
      const res = await fetch(`/api/agent/mandates/${mid}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flow_id: opt.flow_id, credential }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "La tienda no aceptó el pago.");
    } catch (err) {
      const e = err as Error;
      setSignError(e.name === "NotAllowedError" ? "Cancelaste la firma o se agotó el tiempo. Puedes intentarlo de nuevo." : e.message);
      setSign("error");
    }
  }

  async function cancel() {
    const mid = run.approval?.mandate_id;
    if (mid) await fetch(`/api/agent/mandates/${mid}/reject`, { method: "POST" });
  }

  if (run.phase === "completed" && run.order) return <Confirmed run={run} stores={stores} />;
  if (run.phase === "awaiting_approval" || run.phase === "signing") {
    return (
      <Approval
        run={run}
        stores={stores}
        sign={run.phase === "signing" ? "sending" : sign}
        error={signError}
        passkeys={passkeys}
        onApprove={approve}
        onCancel={cancel}
      />
    );
  }
  return <Progress run={run} stores={stores} connection={connection} />;
}

function Progress({ run, stores, connection }: { run: RunView; stores: StoreRef[]; connection: string }) {
  const doneFor = (url: string) => run.conditions.length > 0 && run.conditions.every((c) => run.checklist[url]?.[c.id]);
  const allDone = run.stores.length > 0 && run.stores.every(doneFor);
  const ended = run.phase === "no_purchase" || run.phase === "failed" || run.phase === "rejected";
  const lastStep = [...run.steps].reverse().find((s) => s.kind === "step");

  return (
    <main className="phone">
      <PhoneTop step={ended ? 3 : allDone ? 3 : 2} />
      <div className="phone-main">
        {run.phase === "no_purchase" ? (
          <>
            <h1>No compré nada</h1>
            <p className="lede">{run.decisionSummary ?? "Ninguna tienda cumple todas las condiciones que puedo verificar."}</p>
          </>
        ) : run.phase === "rejected" ? (
          <>
            <h1>Compra cancelada</h1>
            <p className="lede">No se firmó ningún mandato y no se cobró nada.</p>
          </>
        ) : run.phase === "failed" ? (
          <>
            <h1>El encargo se detuvo</h1>
            <p className="notice notice-error" role="alert">
              {run.error ?? "Algo falló. No se cobró nada."}
            </p>
          </>
        ) : (
          <>
            <h1>{allDone ? "Decidiendo…" : "Revisando tiendas"}</h1>
            <p className="lede" aria-live="polite">
              {connection === "lost" ? "Se perdió la conexión; reintentando…" : (lastStep?.text ?? "Leyendo tu encargo…")}
            </p>
          </>
        )}

        {run.errand ? (
          <p className="hint" style={{ marginTop: 0 }}>
            «{run.errand}»
          </p>
        ) : (
          <div className="skeleton" style={{ height: 20, width: "70%" }} />
        )}

        <table className="mini-matrix">
          <caption className="visually-hidden">Condiciones por tienda</caption>
          <thead>
            <tr>
              <th scope="col">Condición</th>
              {stores.map((s) => (
                <th scope="col" key={s.key}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(run.conditions.length ? run.conditions : placeholderConditions).map((c) => (
              <tr key={c.id}>
                <th scope="row" style={{ textTransform: "none", letterSpacing: 0, fontSize: 15, color: "var(--ink)" }}>
                  {run.conditions.length ? SHORT_LABEL[c.kind](c) : <span className="skeleton" style={{ display: "inline-block", width: 90, height: 14 }} />}
                </th>
                {stores.map((s) => {
                  const url = run.stores.find((u) => storeName(stores, u) === s.name);
                  const check = url ? run.checklist[url]?.[c.id] : undefined;
                  return (
                    <td key={s.key}>
                      <StatusCell status={check?.status} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="phone-actions">
          {ended ? (
            <a className="btn btn-primary btn-block" href="/">
              Nuevo encargo
            </a>
          ) : (
            <p className="hint" style={{ textAlign: "center" }}>
              Te pediré tu firma antes de pagar.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

const placeholderConditions = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, label: "", kind: "size" as const, value: "" }));

function StatusCell({ status }: { status?: "met" | "not_met" | "not_verifiable" }) {
  if (!status) return <span className="cell pending">…<span className="visually-hidden">pendiente</span></span>;
  const icon = status === "met" ? <Check size={18} /> : status === "not_met" ? <Cross size={18} /> : <Dash size={18} />;
  return (
    <span className={`cell ${status}`}>
      {icon}
      {STATUS_TEXT[status]}
    </span>
  );
}

function Approval(props: {
  run: RunView;
  stores: StoreRef[];
  sign: SignState;
  error: string | null;
  passkeys: number | null;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const { run, stores, sign, error, passkeys } = props;
  const a = run.approval!;
  const item = parseItem(a.items?.[0]);
  const store = storeName(stores, a.store);
  const checks = Object.values(run.checklist[a.store] ?? {});
  const met = checks.filter((c) => c.status === "met").length;
  const busy = sign === "waiting" || sign === "sending";

  return (
    <main className="phone">
      <PhoneTop step={4} />
      <div className="phone-main">
        <h1>Autoriza la compra</h1>
        <dl className="rows">
          <div className="row"><dt>Producto</dt><dd>{item.product.replace(/^Senda /, "")}</dd></div>
          <div className="row"><dt>Talla</dt><dd className="num">{item.size}</dd></div>
          <div className="row"><dt>Tienda</dt><dd>{store}</dd></div>
          <div className="row"><dt>Entrega</dt><dd>{humanDate(a.latest_delivery) ?? "—"}</dd></div>
          <div className="row total"><dt>Total</dt><dd className="num">{a.total}</dd></div>
        </dl>
        <p className="verified">
          <Check size={18} /> {met} de {run.conditions.length} condiciones verificadas
        </p>
        {passkeys === 0 ? (
          <p className="notice notice-info" role="status">
            <span>
              Aún no hay una passkey registrada para firmar pagos. <a href="/configurar">Configúrala</a> en el dispositivo que va a firmar.
            </span>
          </p>
        ) : null}
        {error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="phone-actions">
          <button className="btn btn-primary btn-block" onClick={props.onApprove} disabled={busy || passkeys === 0}>
            <Key />
            {sign === "waiting" ? "Esperando tu passkey…" : sign === "sending" ? "Pagando con tu mandato…" : "Firmar mandato con passkey"}
          </button>
          <button className="btn btn-quiet btn-block" onClick={props.onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </div>
    </main>
  );
}

function Confirmed({ run, stores }: { run: RunView; stores: StoreRef[] }) {
  const o = run.order!;
  const item = parseItem(o.items?.[0]);
  return (
    <main className="phone">
      <PhoneTop step={4} />
      <div className="phone-main">
        <div className="big-check" aria-hidden>
          <Check size={40} />
        </div>
        <h1>Pedido confirmado</h1>
        <p className="lede">Firmaste el mandato con tu passkey y {storeName(stores, o.store)} aceptó el pago.</p>
        <dl className="rows">
          <div className="row"><dt>Pedido</dt><dd className="mono">{(o.label ?? o.id).replace(/^Pedido /, "")}</dd></div>
          <div className="row"><dt>Producto</dt><dd>{item.product.replace(/^Senda /, "")} · talla {item.size}</dd></div>
          <div className="row"><dt>Llega</dt><dd>{humanDate(o.latest_delivery) ?? "—"}</dd></div>
          <div className="row total"><dt>Pagado</dt><dd className="num">{o.total}</dd></div>
        </dl>
        {run.elapsed ? <p className="hint">Del encargo a la confirmación: {Math.round(run.elapsed)} s.</p> : null}
        <div className="phone-actions">
          <a className="btn btn-primary btn-block" href="/">
            Nuevo encargo
          </a>
        </div>
      </div>
    </main>
  );
}
