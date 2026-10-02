"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StoreRef } from "@/lib/config";
import { PhoneTop } from "./PhoneTop";
import { Arrow } from "./Icons";
import { stageHeaders } from "@/lib/stage";
import { replayChannel, replayName } from "@/lib/useReplay";

const DEFAULT = "Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes.";

export function ErrandForm({ stores }: { stores: StoreRef[] }) {
  const router = useRouter();
  const [errand, setErrand] = useState(DEFAULT);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!errand.trim()) return setError("Escribe qué necesitas.");
    const demo = replayName(new URLSearchParams(window.location.search).get("demo"));
    if (demo) {
      // Plan B: play the recorded run here and on the presenter (same Chrome).
      replayChannel()?.postMessage("start");
      router.push(`/encargo/demo-${demo}`);
      return;
    }
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
        {locked ? (
          <p className="notice notice-info" role="alert" style={{ marginTop: 16 }}>
            <span>
              Este dispositivo todavía no puede enviar encargos. Ábrelo una vez desde el <a href="/configurar">enlace de configuración</a>.
            </span>
          </p>
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
            Nada se paga sin tu firma con passkey.
          </p>
        </div>
      </form>
    </main>
  );
}
