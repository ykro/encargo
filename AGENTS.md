# Encargo — the sneaker race

Talk: **Your Next Customer Is an AI Agent.**

Encargo is a shopping agent that buys on a person's behalf. On stage it gets one errand — "tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes" — and two fictional stores selling the same shoes. **Pulso** is visually stunning and cheaper but only readable by humans; **Kilómetro** is plain but agent-ready. Encargo buys from Kilómetro because it is the only store where it can verify every condition.

## What the talk teaches

| Principle | Where |
| --- | --- |
| Agents read your data, not your marketing | presenter "what the agent sees" panel; per-store checklist met / not met / not verifiable |
| The funnel collapses | the agent never sees a homepage: feed → profile → cart → mandate |
| No agent bias | control mode `PULSO_AGENT_READY` flips the result |
| Trust and authorization | AP2 mandate signed by the person with a passkey |
| A practical checklist | `make audit URL=…` scores how agent-ready any store is |

## Components (all on Cloud Run — phones must not depend on the venue LAN)

| Component | Stack | Cloud Run service |
| --- | --- | --- |
| Pulso (`stores/pulso/`) | Next.js, client-side rendering only (pages render from a small bundled catalog); SQLite for stock, carts and checkouts, like Kilómetro | `encargo-pulso` |
| Kilómetro (`stores/kilometro/`) | Next.js with server rendering, catalog + checkout API routes, SQLite (seeded at startup; state reset by `make reset`) | `encargo-kilometro` |
| Encargo agent (`agent/`) | ADK (Python), Gemini (`GEMINI_MODEL`), Playwright (headless Chromium), UCP client, AP2 client | `encargo-agent` |
| Encargo app (`app/`) | Next.js, WebAuthn passkeys; errand input, approval on the phone, presenter view | `encargo-app` |

Run state (runs, events, mandates, orders) lives in Firestore db `encargo` so all services share it and `make reset` can clear it. Everything also runs locally with `make up` for development.

## Seed catalog

- Both stores sell the same 10 models from a fictional brand (no real brands), trail and road, sizes, stock, prices and delivery times.
- The model that fits the errand costs 139 USD at Pulso and 145 USD at Kilómetro, and both can deliver before Friday — the sale is not lost on price.
- Product images generated with `IMAGE_MODEL` (script + prompts committed). Pulso's images have the price and model name inside the image.

## What makes Pulso opaque

- Price and model name live inside images, sizes sit in a custom visual picker, and the delivery date appears only at the end of checkout after signing in.
- No structured data, no product feed, no public API. It does not block bots; it simply is not machine-readable.

## What makes Kilómetro agent-ready

- schema.org structured data (`Product`, `Offer`, `shippingDetails` with delivery time) on every product page.
- A product feed in Merchant Center format.
- A machine-readable commerce profile per the current UCP spec (catalog search, cart, checkout). If there is no official SDK, implement the profile and minimal endpoints from the spec. If UCP or AP2 is not usable at build time, use schema.org data plus a simple documented checkout API with an explicit approval step — the story holds either way. Record the versions in `VERSIONS.md`.
- Payment authorization with AP2: the agent builds the cart and the person signs the mandate from the phone with a passkey. Payments are sandboxed; no real money or cards.

## Encargo agent

- Receives the errand and both store URLs with no hint favoring either. The choice comes only from what it can verify.
- Tools: read pages and structured data, browse with Playwright (screenshots too), query the UCP profile, create the AP2 mandate.
- Builds a checklist per store (trail model, size 9 in stock, under 150 USD, delivery before Friday) where each item is met, not met or not verifiable.
- Stops before paying and requests approval through AP2.
- Streams every step to the presenter view as server-sent events.

## Presenter view (`encargo-app` route `/presenter`)

- Left: what a human sees — live screenshots of both stores. Right: what the agent sees — the data it extracted from each.
- Center: the agent's reasoning step by step, the checklist filling in live, the final decision.
- When payment is due, the approval card appears on screen while the person signs on the phone.

## Control mode

- `PULSO_AGENT_READY=true` gives Pulso the same structured data and commerce profile as Kilómetro.
- With control mode on, Encargo must buy from Pulso because it is cheaper.

## Readiness audit

- `make audit URL=…` (and a small page in the app) scores a store: structured data, feed, commerce profile, checkout API, delivery info machine-readable. Output is the practical checklist from the talk.

## Acceptance criteria

- `make up` starts both stores, the agent and the app locally; `make deploy` puts them on Cloud Run; the phone reaches the app.
- `make bias-test`: 10 runs with control mode off → buys from Kilómetro ≥ 9; 10 runs with it on → buys from Pulso ≥ 9.
- No payment completes without an AP2 mandate signed by the person (test).
- A full run, errand to confirmation, < 2 minutes.
- `make reset` restores stock and clears carts, orders and events.
- `make test` passes.

## Shared rules (all four demo repos)

These demos are teaching material for a talk. The code, folder names, reports and docs must make the talk's ideas visible. Prefer small files named after the concept they teach, and comments that explain *why*, not *what*.

### Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js (App Router, TypeScript), React |
| Android | Kotlin, Jetpack Compose, Material 3 |
| Cloud models | Gemini via Vertex AI with the Google Gen AI SDK (`@google/genai` / `google-genai`), ADC, `GOOGLE_CLOUD_LOCATION=global` |
| Images | Nano Banana 2 Lite (`IMAGE_MODEL`) via Vertex AI |
| Local models | Gemma served with Ollama; EmbeddingGemma where retrieval is needed |
| Fine-tuning | LoRA with Hugging Face TRL + PEFT as a Vertex AI Custom Job (L4, `europe-west4`); same script wrapped in a Colab notebook; exported to quantized GGUF for Ollama |
| Agents | Agent Development Kit (ADK, Python); MCP for tools; A2A for agent-to-agent |
| Cloud | Google Cloud project `ai-experiments-487722`. Every web app or API runs on **Cloud Run** (`us-central1`, Dockerfile + Cloud Build + Artifact Registry repo `charlas2027`). Firebase services (Auth, Firestore named database per app, FCM, Storage, App Check) are used as SDKs, never Firebase Hosting |
| Local data | JSON/JSONL files or SQLite in the repo |

### Cloud first

Everything runs in the cloud unless the talk requires the laptop (offline model, latency measured on the stage hardware). Every component that runs on the laptop is listed in `docs/DECISIONES.md` with the reason.

### Rules

- No model name or version is hard-coded. Models come from env vars (`GEMINI_MODEL`, `GEMINI_LIVE_MODEL`, `IMAGE_MODEL`, `GEMMA_BASE_MODEL`, `LOCAL_MODEL_TAG`, `EMBEDDING_MODEL`) documented in `.env.example`.
- Preview APIs (AppFunctions with Gemini, WebMCP, UCP, AP2, A2A, MCP SDK, ADK): check the current official docs before implementing (context7 or the web) and record the version used in `docs/DECISIONES.md`.
- `Makefile` targets: `make up` (start everything needed locally), `make reset` (back to the initial state in under 10 seconds), `make test`, `make deploy`, and where it applies `make eval`, `make train`.
- Plan B recordings (`app/public/replays/`) carry a fingerprint of `catalog/catalog.json` and the errand text. A change to either needs `make record-replay` and `./infra/50-deploy-app.sh` in the same change; `make preflight` fails otherwise.
- Data: every record carries `origin` (`web` with URL + license, `synthetic` with model + prompt + seed, `human`). Documented in `data/SOURCES.md` and `data/DATASHEET.md`. Fictional seed data is generated by scripts. No secrets in the repo.
- Python uses `uv`. Node uses npm. Code in English; UI in Spanish (Guatemala/LatAm neutral).
- Tests must pass before a task is done (`make test`). Anything that needs the cloud also has a mock mode (`MOCK_AI=1`) so tests and rehearsals run without network.
- No `CLAUDE.md` in the repo.

### UI/UX bar

- Light theme only. No dark mode. Not overloaded: each screen shows what matters and nothing else.
- Production-grade: own brand identity (name, logo mark, palette, typography), consistent components, designed empty/loading/error states, no placeholder text.
- Web: responsive, keyboard accessible, WCAG 2.2 AA contrast, purposeful motion only. Android: Material 3 and platform conventions.
- Every app on stage has a presenter view: a separate route readable from the back of an auditorium (large type, high contrast, 16:9 at 1920×1080), no logins or manual steps during the talk.
- Visual assets (logos, product photos, sample photos) are generated with `IMAGE_MODEL` by a script in `scripts/` and committed; the prompt is kept next to the asset.

### Docs (written at the end, from the finished code)

- `README.md` (Spanish) and `README.en.md`: one screen — what it is, what you'll learn, the result, diagrams, quickstart and links. Everything else lives in `docs/` (es + en): `DECISIONES` (**technical decisions**: what, why, discarded alternatives, where each component runs and why; preview API versions), `COMANDOS` (`make` commands), `ESTRUCTURA` (repo map), `CREDITOS` (data and licenses).
- `docs/ONBOARDING.md`: prerequisites with versions, local setup, credentials/ADC, GCP setup with `infra/NN-*.sh`, run/test/rehearse, code walkthrough, troubleshooting, talk-day checklist.
- `docs/diagrams/`: made with the `diagram-design` skill, exported to SVG and PNG.
- Never describe the project as a deviation from a spec; the docs describe what the project is.
