"use client";
// Before the talk: enroll the presenter's phone. Requires the setup code, so
// nobody in the audience can enroll a device and approve purchases.
import { useEffect, useState } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { PhoneTop } from "./PhoneTop";
import { saveStageToken, stageToken } from "@/lib/stage";
import { Check, Key } from "./Icons";

type State = "idle" | "working" | "done" | "error";
interface Device { id: string; label?: string; created_at?: number; last_used_at?: number }

const when = (t?: number) => (t ? new Date(t * 1000).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" }) : "nunca");

export function PasskeySetup() {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("Portátil del presentador");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<{ registered: number; rp_id: string; passkeys: Device[] } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const refresh = (setup?: string) =>
    fetch("/api/agent/passkeys/status", setup ? { headers: { authorization: `Bearer ${setup}` } } : {})
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));

  const [enabled, setEnabled] = useState(false);

  async function enableDevice(setup: string) {
    try {
      const res = await fetch("/api/agent/stage/session", { method: "POST", headers: { authorization: `Bearer ${setup}` } });
      if (!res.ok) return;
      const body = await res.json();
      if (body.stage_token) saveStageToken(body.stage_token);
      setEnabled(true);
    } catch {
      /* the registration step will report connectivity problems */
    }
  }

  useEffect(() => {
    const clave = new URLSearchParams(window.location.search).get("clave") ?? "";
    setCode(clave);
    setEnabled(Boolean(stageToken()));
    if (clave) {
      refresh(clave);
      // Never leave the setup code in the address bar or the history.
      window.history.replaceState(null, "", window.location.pathname);
      enableDevice(clave);
    }
    setSupported(browserSupportsWebAuthn());
    refresh();
  }, []);

  async function remove(device: Device) {
    if (!code.trim()) {
      setState("error");
      setMessage("Escribe el código de configuración para eliminar un dispositivo.");
      return;
    }
    setRemoving(device.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/agent/passkeys/${device.id}`, { method: "DELETE", headers: { authorization: `Bearer ${code.trim()}` } });
      if (res.status === 401) throw new Error("El código de configuración no es válido.");
      if (!res.ok) throw new Error((await res.json()).detail ?? "No se pudo eliminar.");
      setState("done");
      setMessage(`Eliminaste «${device.label ?? "dispositivo"}»: ya no puede firmar pagos.`);
      refresh(code.trim());
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    } finally {
      setRemoving(null);
    }
  }

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
      await enableDevice(code.trim());
      setState("done");
      setMessage(`Listo: «${body.label}» ya puede firmar pagos.`);
      refresh(code.trim());
    } catch (err) {
      const e = err as Error;
      void fetch("/api/client-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ where: "passkey-register", name: e.name, message: e.message }),
      }).catch(() => {});
      setState("error");
      setMessage(e.name === "NotAllowedError" ? "Cancelaste el registro o se agotó el tiempo." : e.name === "InvalidStateError" ? "Este dispositivo ya tiene una passkey registrada aquí." : e.message);
    }
  }

  return (
    <main className="phone">
      <PhoneTop />
      <form className="phone-main" onSubmit={register}>
        <h1>Configura tu passkey</h1>
        <p className="lede">Tu passkey es la única forma de autorizar un pago. Se guarda en este dispositivo y se desbloquea con tu huella o tu rostro.</p>
        {status ? (
          <p className="notice notice-info" role="status">
            {status.registered === 0 ? "Aún no hay passkeys registradas" : `${status.registered} passkey${status.registered === 1 ? "" : "s"} registrada${status.registered === 1 ? "" : "s"}`} para {status.rp_id}.
          </p>
        ) : null}
        {status?.passkeys?.length ? (
          <ul className="devices" aria-label="Dispositivos que pueden firmar">
            {status.passkeys.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.label ?? "Dispositivo"}</strong>
                  <small>Registrada {when(d.created_at)} · último uso {when(d.last_used_at)}</small>
                </span>
                <button type="button" className="btn btn-quiet" onClick={() => remove(d)} disabled={removing === d.id} aria-label={`Eliminar ${d.label ?? "dispositivo"}`}>
                  {removing === d.id ? "Eliminando…" : "Eliminar"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {enabled ? (
          <p className="notice notice-ok" role="status" style={{ marginTop: 12 }}>
            <Check size={18} /> Este dispositivo puede enviar encargos y cancelar pagos.
          </p>
        ) : null}
        {!supported ? (
          <p className="notice notice-error" role="alert">Este navegador no admite passkeys.</p>
        ) : null}
        <label className="field-label" htmlFor="code" style={{ marginTop: 20 }}>Código de configuración</label>
        <input id="code" className="text mono" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} required />
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
            {state === "working" ? "Esperando tu passkey…" : "Registrar passkey en este dispositivo"}
          </button>
          {state === "done" ? (
            <a className="btn btn-quiet btn-block" href="/">Ir a hacer un encargo</a>
          ) : null}
        </div>
      </form>
    </main>
  );
}
