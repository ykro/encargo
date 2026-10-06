"use client";
// Talk day from the pages themselves: the presenter wakes and checks every service when it
// opens, keeps them warm while it stays open, and offers «Empezar de nuevo» and the control
// switch. Nobody runs a command.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { saveStageToken, stageHeaders, stageToken } from "./stage";
import { replayChannel, type ReplayName } from "./useReplay";

export interface StageStatus {
  ready: boolean;
  stores: { key: string | null; ok: boolean; ms: number; stock: number | null }[];
  agent: { mode: string; model_warm: boolean; browser_warm: boolean };
  passkeys: number;
  control: boolean | null;
  run_active: boolean;
  problems: string[];
  reset?: boolean;
}

const KEEP_WARM_MS = 4 * 60_000; // Cloud Run keeps an instance about 15 min after the last request

/** Wakes everything on open (optionally starting from a clean slate), then polls until ready. */
export function useStageStatus(opts: { autoReset: boolean }): { status: StageStatus | null; agentDown: boolean; refresh: () => void } {
  const [status, setStatus] = useState<StageStatus | null>(null);
  const [agentDown, setAgentDown] = useState(false);
  const ready = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/stage/status", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as StageStatus;
      ready.current = body.ready;
      setStatus(body);
      setAgentDown(false);
    } catch {
      setAgentDown(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const warm = (autoReset: boolean) =>
      fetch("/api/agent/stage/warmup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auto_reset: autoReset }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => {
          if (alive && b) {
            ready.current = b.ready;
            setStatus(b);
            setAgentDown(false);
          }
        })
        .catch(() => alive && setAgentDown(true));
    warm(opts.autoReset);
    load();
    const poll = setInterval(() => {
      if (!ready.current) load();
    }, 3000);
    const keep = setInterval(() => warm(false), KEEP_WARM_MS);
    const slow = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(keep);
      clearInterval(slow);
    };
  }, [load, opts.autoReset]);

  return { status, agentDown, refresh: load };
}

export async function stagePost(path: "reset" | "control", body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(`/api/agent/stage/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...stageHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) return "Este navegador no está habilitado: ábrelo desde el teléfono y toca «Habilitar con Touch ID».";
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? "No se pudo completar.";
    return null;
  } catch {
    return "Sin conexión con el agente. Intenta de nuevo.";
  }
}

/** Enables this browser (phone and presenter share it) with the registered passkey: Touch ID, no code. */
export async function enableWithPasskey(): Promise<string | null> {
  try {
    const optRes = await fetch("/api/agent/stage/session/passkey-options", { method: "POST" });
    const opt = await optRes.json();
    if (!optRes.ok) return opt.detail ?? "No se pudo preparar la verificación.";
    const credential = await startAuthentication({ optionsJSON: JSON.parse(opt.options) });
    const res = await fetch("/api/agent/stage/session/passkey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow_id: opt.flow_id, credential }),
    });
    const body = await res.json();
    if (!res.ok) return body.detail ?? "La passkey no fue aceptada.";
    if (body.stage_token) saveStageToken(body.stage_token);
    return null;
  } catch (err) {
    const e = err as Error;
    return e.name === "NotAllowedError" ? "Cancelaste la verificación o se agotó el tiempo. Intenta de nuevo." : e.message;
  }
}

export function useEnrolled(): [boolean, () => void] {
  const [enrolled, setEnrolled] = useState(false);
  const check = useCallback(() => setEnrolled(Boolean(stageToken())), []);
  useEffect(() => {
    check();
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, [check]);
  return [enrolled, check];
}

/** The phone window follows the presenter: when it switches to the recorded run or back to live. */
export function usePhoneFollowsPresenter(current: "live" | ReplayName) {
  const router = useRouter();
  useEffect(() => {
    const channel = replayChannel();
    if (!channel) return;
    channel.onmessage = (m) => {
      const msg = typeof m.data === "string" ? { type: m.data } : m.data;
      if (msg.type === "replay" && msg.name && msg.name !== current) router.push(`/encargo/demo-${msg.name}`);
      if (msg.type === "live" && current !== "live") router.push("/");
    };
    return () => channel.close();
  }, [current, router]);
}
