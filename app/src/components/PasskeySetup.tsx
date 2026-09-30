"use client";
// Before the talk: enroll the presenter's phone. Requires the setup code, so
// nobody in the audience can enroll a device and approve purchases.
import { useEffect, useState } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { PhoneTop } from "./PhoneTop";
import { Check, Key } from "./Icons";

type State = "idle" | "working" | "done" | "error";

export function PasskeySetup() {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("Teléfono del presentador");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<{ registered: number; rp_id: string } | null>(null);
  const [supported, setSupported] = useState(true);

  const refresh = () =>
    fetch("/api/agent/passkeys/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));

  useEffect(() => {
    setCode(new URLSearchParams(window.location.search).get("clave") ?? "");
    setSupported(browserSupportsWebAuthn());
    refresh();
  }, []);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setState("working");
    setMessage(null);
    const auth = { "content-type": "application/json", authorization: `Bearer ${code.trim()}` };
    try {
      const optRes = await fetch("/api/agent/passkeys/register/options", { method: "POST", headers: auth, body: JSON.stringify({ label }) });
      const opt = await optRes.json();
      if (optRes.status === 401) throw new Error("El código de configuración no es válido.");
      if (!optRes.ok) throw new Error(opt.detail ?? "No se pudo iniciar el registro.");
      const credential = await startRegistration({ optionsJSON: JSON.parse(opt.options) });
      const res = await fetch("/api/agent/passkeys/register/verify", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ flow_id: opt.flow_id, credential }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "No se pudo verificar la passkey.");
      setState("done");
      setMessage(`Listo: «${body.label}» ya puede firmar pagos.`);
      refresh();
    } catch (err) {
      const e = err as Error;
      setState("error");
      setMessage(e.name === "NotAllowedError" ? "Cancelaste el registro o se agotó el tiempo." : e.name === "InvalidStateError" ? "Este dispositivo ya tiene una passkey registrada aquí." : e.message);
    }
  }

  return (
    <main className="phone">
      <PhoneTop />
      <form className="phone-main" onSubmit={register}>
        <h1>Configura tu passkey</h1>
        <p className="lede">Tu passkey es la única forma de autorizar un pago. Se guarda en este teléfono y se desbloquea con tu huella o tu rostro.</p>
        {status ? (
          <p className="notice notice-info" role="status">
            {status.registered === 0 ? "Aún no hay passkeys registradas" : `${status.registered} passkey${status.registered === 1 ? "" : "s"} registrada${status.registered === 1 ? "" : "s"}`} para {status.rp_id}.
          </p>
        ) : null}
        {!supported ? (
          <p className="notice notice-error" role="alert">Este navegador no admite passkeys.</p>
        ) : null}
        <label className="field-label" htmlFor="code" style={{ marginTop: 20 }}>Código de configuración</label>
        <input id="code" className="text mono" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
        <label className="field-label" htmlFor="label" style={{ marginTop: 16 }}>Nombre del dispositivo</label>
        <input id="label" className="text" value={label} onChange={(e) => setLabel(e.target.value)} />
        {message ? (
          <p className={`notice ${state === "done" ? "notice-ok" : "notice-error"}`} role={state === "done" ? "status" : "alert"} style={{ marginTop: 16 }}>
            {state === "done" ? <Check size={18} /> : null}
            {message}
          </p>
        ) : null}
        <div className="phone-actions">
          <button className="btn btn-primary btn-block" type="submit" disabled={state === "working" || !supported}>
            <Key />
            {state === "working" ? "Esperando tu passkey…" : "Registrar passkey en este teléfono"}
          </button>
          {state === "done" ? (
            <a className="btn btn-quiet btn-block" href="/">Ir a hacer un encargo</a>
          ) : null}
        </div>
      </form>
    </main>
  );
}
