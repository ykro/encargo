# Repository structure

What runs where and where each thing lives in the code. Back to the [README](../README.en.md). [Versión en español](ESTRUCTURA.md).

## Architecture

| Component | Code | Stack | Cloud Run service |
| --- | --- | --- | --- |
| Pulso | `stores/pulso/` | Next.js, everything drawn in the browser, in-process SQLite | `encargo-pulso` |
| Kilómetro | `stores/kilometro/` | Next.js with server rendering, UCP API, in-process SQLite | `encargo-kilometro` |
| Shared commerce kit | `stores/shared/` | schema.org, feed, UCP and AP2 verification (TypeScript). Copied into each store | — |
| Encargo agent | `agent/` | Python 3.13, ADK, Gemini (`GEMINI_MODEL`) on Vertex AI, Playwright (headless Chromium), FastAPI | `encargo-agent` |
| Encargo app | `app/` | Next.js. The errand and passkey approval on the "phone" (`/`, `/encargo/[id]`), the presenter (`/presenter`), passkey setup (`/configurar`) and the audit (`/auditoria`) | `encargo-app` |
| Run state | — | Firestore, database `encargo` | — |

The app never calls the agent from the browser. It uses a same-origin proxy (`app/src/app/api/agent/[...path]/route.ts`), including the SSE stream, so passkeys have one origin and there is no CORS. The agent streams every step as events (`step`, `observation`, `agent_view`, `checklist`, `approval_requested`, `order_confirmed`, …). The phone and the presenter render those same events.

## Repo map

```text
encargo/
├── AGENTS.md               demo specification
├── Makefile                every command
├── README.md               what it is, quickstart and links (README.en.md in English)
├── VERSIONS.md             UCP, AP2 and dependency versions
├── .env.example            models and settings (copy to .env)
├── catalog/
│   ├── seed.py             fictional "Senda" catalog (make seed)
│   ├── catalog.json        10 models, price, stock and delivery per store
│   └── images/             studio photos + Pulso ads (pulso/), each with its .prompt.json
├── stores/
│   ├── shared/src/         commerce kit: schemaOrg, merchantFeed, ucp/, ap2/, db (SQLite), delivery
│   ├── sync-shared.mjs     copies the kit and the catalog into each store
│   ├── kilometro/          agent-ready store (SSR, /feed.xml, /.well-known/ucp, /ucp/v1/…)
│   └── pulso/              human-only store (CSR, text inside photos, sizes on a canvas)
├── agent/encargo/
│   ├── agent.py            ADK agent: instruction and tools
│   ├── runner.py           one run: events, time limit, decision
│   ├── model.py            Gemini with hedged calls
│   ├── errand.py           the errand → four conditions (and the Friday rule)
│   ├── tools/              discovery, product_feed, ucp_client, structured_data, browser, checklist, approval, agent_view
│   ├── passkey.py          WebAuthn: enrollment and checkout-bound signature
│   ├── purchase.py         signs the mandate and completes (human endpoint only)
│   ├── ap2/                SD-JWT ES256, store signature
│   ├── runstore/           Firestore (cloud) or memory (tests)
│   ├── audit.py            make audit
│   ├── bias_test.py        make bias-test
│   ├── mock_planner.py     MOCK_AI=1: deterministic planner with the same tools
│   └── api.py              FastAPI: /runs, SSE, /mandates, /passkeys, /audit, /.well-known/ucp
├── app/src/
│   ├── app/                /, /encargo/[id], /presenter, /configurar, /auditoria, /api/agent (proxy), /api/control
│   ├── components/         ErrandForm, RunPhone, Presenter, PasskeySetup, AuditView
│   └── lib/                useRun (SSE), runState (events → screen)
├── infra/                  10-enable-apis, 20-secrets, 30-deploy-stores, 40-deploy-agent, 50-deploy-app
├── scripts/                up.sh, reset.sh, e2e_passkey.py, e2e_emulator.py, screens_app.py, generate_product_images.py
├── data/                   SOURCES.md, DATASHEET.md
└── docs/                   DEMO, ONBOARDING, DECISIONES, COMANDOS, ESTRUCTURA, CREDITOS (.md and .en.md), diagrams/, demo/, screenshots/
```
