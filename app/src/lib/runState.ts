// Folds the agent's event stream into what the screens show. Pure and
// order-dependent: the same events always produce the same view.

export type CheckStatus = "met" | "not_met" | "not_verifiable";

export interface Condition {
  id: string;
  label: string;
  kind: "category" | "size" | "max_price_usd" | "deliver_by";
  value: string;
}

export interface Offer {
  product?: string;
  price?: string;
  category_text?: string;
  sizes_in_stock?: string[];
  arrives_by?: string;
}

export interface AgentView {
  sources?: { ucp: boolean; feed: boolean; sitemap: boolean; jsonld?: boolean };
  title?: string;
  offers: Offer[];
  offerSources: string[];
  pages: { url: string; visible_text_chars: number; jsonld_products: number }[];
}

export interface Step {
  seq: number;
  kind: "step" | "thought" | "check";
  text: string;
  store?: string;
}

export interface CheckoutSummary {
  store: string;
  checkout_id?: string;
  items?: string[];
  total?: string;
  total_amount?: number;
  latest_delivery?: string;
  reason?: string;
  mandate_id?: string;
  merchant_signed?: boolean;
  expires_at?: string;
}

export interface Order {
  id: string;
  label?: string;
  store: string;
  total?: string;
  latest_delivery?: string;
  items?: string[];
}

export type Phase =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "signing"
  | "completed"
  | "no_purchase"
  | "rejected"
  | "failed";

export interface RunView {
  id?: string;
  errand: string;
  stores: string[];
  conditions: Condition[];
  phase: Phase;
  startedAt?: number;
  finishedAt?: number;
  checklist: Record<string, Record<string, { status: CheckStatus; evidence: string; product?: string }>>;
  agentView: Record<string, AgentView>;
  humanView: Record<string, { screenshotId: string; purpose: string; url: string; src?: string }>;
  steps: Step[];
  activeStore?: string;
  checkout?: CheckoutSummary;
  approval?: CheckoutSummary;
  decisionSummary?: string;
  signedWith?: string;
  order?: Order;
  elapsed?: number;
  error?: string;
}

export const emptyRun = (): RunView => ({
  errand: "",
  stores: [],
  conditions: [],
  phase: "idle",
  checklist: {},
  agentView: {},
  humanView: {},
  steps: [],
});

type AnyEvent = Record<string, any> & { type: string; seq: number; at?: number };

const view = (v: RunView, store: string): AgentView =>
  (v.agentView[store] ??= { offers: [], offerSources: [], pages: [] });

export function reduce(v: RunView, e: AnyEvent): RunView {
  const next: RunView = structuredClone(v);
  switch (e.type) {
    case "run_started":
      next.errand = e.errand;
      next.stores = e.stores;
      next.conditions = e.conditions;
      next.phase = "running";
      next.startedAt ??= e.at ? e.at * 1000 : Date.now();
      break;
    case "human_view":
      // Keep the front page (what a person sees first); later agent browses only fill gaps.
      if (e.purpose === "human_view" || !next.humanView[e.store]) {
        // Recorded runs carry the image inline (data URL) so they play offline.
        next.humanView[e.store] = { screenshotId: e.screenshot_id, purpose: e.purpose, url: e.url, src: e.screenshot_data };
      }
      break;
    case "agent_view": {
      const av = view(next, e.store);
      if (e.kind === "sources") {
        av.sources = e.sources;
        av.title = e.title;
      } else if (e.kind === "offers") {
        for (const o of e.offers as Offer[]) {
          const i = av.offers.findIndex((x) => x.product === o.product);
          if (i >= 0) av.offers[i] = { ...av.offers[i], ...o };
          else av.offers.push(o);
        }
        if (!av.offerSources.includes(e.source)) av.offerSources.push(e.source);
      } else if (e.kind === "page") {
        av.pages.push({ url: e.url, visible_text_chars: e.visible_text_chars, jsonld_products: e.jsonld_products });
      }
      break;
    }
    case "step":
      next.activeStore = e.args?.store_url ?? (e.args?.url || e.args?.feed_url ? storeOf(next, e.args.url ?? e.args.feed_url) : next.activeStore);
      if (e.tool !== "record_check") next.steps.push({ seq: e.seq, kind: "step", text: e.label, store: next.activeStore });
      break;
    case "thought":
      if (e.text) next.steps.push({ seq: e.seq, kind: "thought", text: e.text });
      break;
    case "checklist":
      (next.checklist[e.store] ??= {})[e.condition_id] = { status: e.status, evidence: e.evidence, product: e.product || undefined };
      next.steps.push({ seq: e.seq, kind: "check", text: e.evidence, store: e.store });
      break;
    case "checkout_created":
      next.checkout = { store: e.store, checkout_id: e.checkout_id, items: e.items, total: e.total, total_amount: e.total_amount, latest_delivery: e.latest_delivery };
      break;
    case "approval_requested":
      next.approval = {
        store: e.store,
        mandate_id: e.mandate_id,
        items: e.items,
        total: e.total,
        total_amount: e.total_amount,
        latest_delivery: e.latest_delivery,
        reason: e.reason,
        merchant_signed: e.merchant_signed,
        expires_at: e.expires_at,
      };
      next.phase = "awaiting_approval";
      break;
    case "decision":
      next.decisionSummary = e.summary;
      break;
    case "mandate_signed":
      next.phase = "signing";
      next.signedWith = e.method;
      break;
    case "order_confirmed":
      next.order = e.order;
      next.elapsed = e.elapsed_s;
      next.phase = "completed";
      next.finishedAt = e.at ? e.at * 1000 : Date.now();
      break;
    case "order_failed":
      next.error = e.reason;
      break;
    case "approval_rejected":
      next.phase = "rejected";
      break;
    case "run_finished":
      if (e.status === "no_purchase") next.phase = "no_purchase";
      if (e.status === "failed") {
        next.phase = "failed";
        next.error ??= e.error;
      }
      if (e.status === "rejected") next.phase = "rejected";
      next.finishedAt ??= e.at ? e.at * 1000 : Date.now();
      break;
  }
  return next;
}

function storeOf(v: RunView, url: string): string | undefined {
  try {
    const host = new URL(url).host;
    return v.stores.find((s) => new URL(s).host === host);
  } catch {
    return undefined;
  }
}

/** The product the agent evaluated at a store, with the facts it read for it. */
export function focusOffer(v: RunView, store: string): Offer | undefined {
  const named = Object.values(v.checklist[store] ?? {}).find((c) => c.product)?.product;
  const offers = v.agentView[store]?.offers ?? [];
  if (named) return offers.find((o) => o.product === named) ?? { product: named };
  return undefined;
}

export function readableFields(o: Offer | undefined): number {
  if (!o) return 0;
  return [o.price, o.category_text, o.sizes_in_stock?.length ? o.sizes_in_stock : undefined, o.arrives_by].filter(Boolean).length;
}

export const SHORT_LABEL: Record<Condition["kind"], (c: Condition) => string> = {
  category: (c) => (c.value === "trail" ? "Trail" : "Ruta"),
  size: (c) => `Talla ${c.value}`,
  max_price_usd: (c) => `< ${c.value} USD`,
  deliver_by: (c) => `Antes del ${WEEKDAYS[new Date(`${c.value}T12:00:00Z`).getUTCDay()]}`,
};

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export const STATUS_TEXT: Record<CheckStatus, string> = {
  met: "cumple",
  not_met: "no cumple",
  not_verifiable: "no verificable",
};

/** "2026-10-01 (jueves 1 oct)" → "jueves 1 oct" */
export const humanDate = (s?: string) => (s ? (s.match(/\(([^)]+)\)/)?.[1] ?? s) : undefined);
