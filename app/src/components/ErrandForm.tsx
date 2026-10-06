"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StoreRef } from "@/lib/config";
import { PhoneTop } from "./PhoneTop";
import { Arrow } from "./Icons";
import { stageHeaders } from "@/lib/stage";
import { enableWithPasskey, useEnrolled, usePhoneFollowsPresenter, useStageStatus } from "@/lib/stageClient";

const DEFAULT = "Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes.";

export function ErrandForm({ stores }: { stores: StoreRef[] }) {
  const router = useRouter();
  const [errand, setErrand] = useState(DEFAULT);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [enrolled, recheck] = useEnrolled();
  const [enabling, setEnabling] = useState(false);
  const stage = useStageStatus({ autoReset: false });
  usePhoneFollowsPresenter("live");

  async function enable() {
    setEnabling(true);
    setError(null);
    const problem = await enableWithPasskey();
    if (problem) setError(problem);
    else {
      setLocked(false);
      recheck();
    }
    setEnabling(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!errand.trim()) return setError("Escribe qué necesitas.");
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/runs", {
        method: "POST",
        headers: { "content-type": "application/json", ...stageHeaders() },
        body: JSON.stringify({ errand: errand.trim() }),
      });
      const body = await res.json();
      if (res.status === 401) {
        setLocked(true);
        setSending(false);
        return;
      }
      if (!res.ok) throw new Error(body.detail ?? "No se pudo enviar el encargo.");
      router.push(`/encargo/${body.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  }

  return (
    <main className="phone">
      <PhoneTop step={1} />
      <form className="phone-main" onSubmit={submit}>
        <h1>¿Qué necesitas?</h1>
        <p className="lede">Dilo como se lo dirías a alguien de confianza. Encargo compra solo donde puede comprobar cada condición.</p>
        <label className="field-label" htmlFor="errand">
          Tu encargo
        </label>
        <textarea id="errand" className="errand" rows={4} value={errand} onChange={(e) => setErrand(e.target.value)} />
        <div className="stores-line" aria-label="Tiendas donde buscará">
          <span className="hint" style={{ margin: 0, alignSelf: "center" }}>
            Buscará en
          </span>
          {stores.map((s) => (
            <span key={s.key} className="chip">
              {s.name}
            </span>
          ))}
        </div>
        {locked || !enrolled ? (
          <div className="notice notice-info enable-card" role={locked ? "alert" : undefined} style={{ marginTop: 16 }}>
            <span>Para enviar encargos y firmar desde este navegador, habilítalo con la passkey de este portátil.</span>
            <button className="btn btn-secondary" type="button" onClick={enable} disabled={enabling}>
              {enabling ? "Esperando Touch ID…" : "Habilitar con Touch ID"}
            </button>
          </div>
        ) : null}
        {error ? (
          <p className="notice notice-error" role="alert" style={{ marginTop: 16 }}>
            {error}
          </p>
        ) : null}
        <div className="phone-actions">
          <button className="btn btn-primary btn-block" type="submit" disabled={sending}>
            {sending ? "Enviando…" : "Enviar encargo"}
            {!sending && <Arrow />}
          </button>
          <p className="hint" style={{ textAlign: "center" }}>
            {stage.status && !stage.status.ready ? "Preparando las tiendas y el agente… puedes enviarlo igual." : "Nada se paga sin tu firma con passkey."}
          </p>
        </div>
      </form>
    </main>
  );
}
