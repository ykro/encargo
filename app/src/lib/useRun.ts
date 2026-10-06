"use client";
// Live run state from the agent's server-sent events (through the app's proxy).
import { useEffect, useRef, useState } from "react";
import { emptyRun, reduce, type RunView } from "./runState";

const EVENT_TYPES = [
  "run_started", "human_view", "agent_view", "step", "observation", "thought", "checklist",
  "checkout_created", "approval_requested", "decision", "mandate_signed", "order_confirmed",
  "order_failed", "approval_rejected", "run_finished",
];

export type Connection = "connecting" | "live" | "ended" | "lost";

export function useRun(runId: string | undefined): { run: RunView; connection: Connection } {
  const [run, setRun] = useState<RunView>(emptyRun);
  const [connection, setConnection] = useState<Connection>("connecting");
  const lastSeq = useRef(0);

  useEffect(() => {
    lastSeq.current = 0;
    if (!runId) {
      // After a reset there is no run any more: clear the screen instead of keeping the last one.
      setRun(emptyRun());
      return;
    }
    setRun({ ...emptyRun(), id: runId });
    setConnection("connecting");
    const source = new EventSource(`/api/agent/runs/${runId}/events`);
    const onEvent = (msg: MessageEvent) => {
      const e = JSON.parse(msg.data);
      if (e.seq <= lastSeq.current) return; // reconnects resend; keep it idempotent
      lastSeq.current = e.seq;
      setRun((v) => reduce(v, e));
    };
    EVENT_TYPES.forEach((t) => source.addEventListener(t, onEvent as EventListener));
    source.addEventListener("end", () => {
      setConnection("ended");
      source.close();
    });
    source.onopen = () => setConnection("live");
    source.onerror = () => setConnection(source.readyState === EventSource.CLOSED ? "lost" : "connecting");
    return () => source.close();
  }, [runId]);

  return { run: { ...run, id: runId }, connection };
}

/** Seconds since a timestamp, ticking every second while `running`. */
export function useElapsed(startedAt: number | undefined, finishedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt, finishedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000));
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
