"use client";
// Plan B: replays a recorded cloud run (app/public/replays/<name>.json) with its
// original timing, through the same reducer as a live run. No agent, no Gemini.
//
// The phone and the presenter run in the same Chrome on the laptop, so they
// coordinate over a BroadcastChannel: the phone's "start" starts the presenter's
// replay, and its "signed" lets the replay continue past the approval card.
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyRun, reduce, type RunView } from "./runState";

export const REPLAYS = ["kilometro", "pulso-control"] as const;
export type ReplayName = (typeof REPLAYS)[number];

type AnyEvent = Record<string, any> & { type: string; seq: number; at: number };
export type ReplayState = "loading" | "ready" | "playing" | "waiting_signature" | "done" | "error";

export const replayChannel = () => (typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("encargo-demo"));
/** How the person approved during a replay: a real passkey on this laptop, or the presenter's Space key. */
export type ReplaySignature = "passkey" | "space" | "simulated";

/** "1 oct 2026" from the recording's ISO timestamp: the dates inside a replay are the ones of that day. */
export function recordedDay(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

export function replayName(param: string | null): ReplayName | null {
  if (!param) return null;
  if (param === "1" || param === "true") return "kilometro";
  return (REPLAYS as readonly string[]).includes(param) ? (param as ReplayName) : null;
}

export function useReplay(name: ReplayName | null, opts: { waitForSignature: boolean }) {
  const [run, setRun] = useState<RunView>(emptyRun);
  const [state, setState] = useState<ReplayState>("loading");
  const [controlMode, setControlMode] = useState<boolean | null>(null);
  const [recordedAt, setRecordedAt] = useState<string | null>(null);
  const events = useRef<AnyEvent[]>([]);
  const index = useRef(0);
  const offset = useRef(0); // seconds added to recorded timestamps so timers read "now"
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = useRef(false);
  const signed = useRef(false);
  const method = useRef<ReplaySignature>("space");

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    if (!name) return;
    let alive = true;
    stop();
    setState("loading");
    setRun({ ...emptyRun(), id: `demo-${name}` });
    fetch(`/replays/${name}.json`)
      .then((r) => r.json())
      .then((body) => {
        if (!alive) return;
        events.current = body.events as AnyEvent[];
        setControlMode(Boolean(body.control_mode));
        setRecordedAt(typeof body.recorded_at === "string" ? body.recorded_at : null);
        index.current = 0;
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
      stop();
    };
  }, [name]);

  const step = useCallback(() => {
    const list = events.current;
    const i = index.current;
    if (i >= list.length) {
      setState("done");
      return;
    }
    const e = list[i];
    // Hold after the approval card until the person "signs" on the phone.
    if (opts.waitForSignature && !signed.current && e.type === "mandate_signed") {
      waiting.current = true;
      setState("waiting_signature");
      return;
    }
    // Never replay "signed with passkey" unless a passkey signed now: the recorded
    // method is replaced by how this replay was actually approved.
    const replayed = e.type === "mandate_signed" ? { ...e, method: method.current } : e;
    setRun((v) => reduce(v, { ...replayed, at: e.at + offset.current }));
    index.current = i + 1;
    const next = list[i + 1];
    if (!next) {
      setState("done");
      return;
    }
    timer.current = setTimeout(step, Math.max(0, (next.at - e.at) * 1000));
  }, [opts.waitForSignature]);

  const start = useCallback(() => {
    const list = events.current;
    if (!list.length) return;
    stop();
    index.current = 0;
    signed.current = false;
    waiting.current = false;
    offset.current = Date.now() / 1000 - list[0].at;
    setRun({ ...emptyRun(), id: `demo-${name}` });
    setState("playing");
    step();
  }, [name, step]);

  const sign = useCallback((how: ReplaySignature = "space") => {
    method.current = how;
    signed.current = true;
    if (!waiting.current) return;
    waiting.current = false;
    // Shift the rest of the recording so its timestamps continue from now.
    const e = events.current[index.current];
    if (e) offset.current = Date.now() / 1000 - e.at;
    setState("playing");
    step();
  }, [step]);

  return { run, state, start, sign, controlMode, recordedAt };
}
