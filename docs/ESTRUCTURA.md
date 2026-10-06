# Estructura del repositorio

Qué corre dónde y dónde está cada cosa en el código. Volver al [README](../README.md). [English version](ESTRUCTURA.en.md).

## Arquitectura

| Componente | Código | Stack | Servicio de Cloud Run |
| --- | --- | --- | --- |
| Pulso | `stores/pulso/` | Next.js, todo se dibuja en el navegador, SQLite en el proceso | `encargo-pulso` |
| Kilómetro | `stores/kilometro/` | Next.js con render en el servidor, API UCP, SQLite en el proceso | `encargo-kilometro` |
| Kit de comercio compartido | `stores/shared/` | schema.org, feed, UCP y verificación AP2 (TypeScript). Se copia dentro de cada tienda | — |
| Agente Encargo | `agent/` | Python 3.13, ADK, Gemini (`GEMINI_MODEL`) vía Vertex AI, Playwright (Chromium headless), FastAPI | `encargo-agent` |
| App Encargo | `app/` | Next.js. El encargo y la aprobación con passkey en el «teléfono» (`/`, `/encargo/[id]`), el presentador (`/presenter`), la configuración de la passkey (`/configurar`) y la auditoría (`/auditoria`) | `encargo-app` |
| Estado de las ejecuciones | — | Firestore, base `encargo` | — |

La app nunca llama al agente desde el navegador. Usa un proxy en el mismo origen (`app/src/app/api/agent/[...path]/route.ts`), incluido el stream SSE, para que las passkeys tengan un solo origen y no haya CORS. El agente transmite cada paso como eventos (`step`, `observation`, `agent_view`, `checklist`, `approval_requested`, `order_confirmed`, …). El teléfono y el presentador dibujan esos mismos eventos.

## Mapa del repositorio

```text
encargo/
├── AGENTS.md               especificación de la demo
├── Makefile                todos los comandos
├── README.md               qué es, arranque rápido y enlaces (README.en.md en inglés)
├── VERSIONS.md             versiones de UCP, AP2 y dependencias
├── .env.example            modelos y configuración (copiar a .env)
├── catalog/
│   ├── seed.py             catálogo ficticio "Senda" (make seed)
│   ├── catalog.json        10 modelos, precio, stock y entrega por tienda
│   └── images/             fotos de estudio + anuncios de Pulso (pulso/), cada una con su .prompt.json
├── stores/
│   ├── shared/src/         kit de comercio: schemaOrg, merchantFeed, ucp/, ap2/, db (SQLite), delivery
│   ├── sync-shared.mjs     copia el kit y el catálogo dentro de cada tienda
│   ├── kilometro/          tienda lista para agentes (SSR, /feed.xml, /.well-known/ucp, /ucp/v1/…)
│   └── pulso/              tienda solo para humanos (CSR, fotos con texto, tallas en canvas)
├── agent/encargo/
│   ├── agent.py            agente ADK: instrucción y herramientas
│   ├── runner.py           una ejecución: eventos, tiempo límite, decisión
│   ├── model.py            Gemini con llamadas cubiertas (hedged)
│   ├── errand.py           el encargo → cuatro condiciones (y la regla del viernes)
│   ├── tools/              discovery, product_feed, ucp_client, structured_data, browser, checklist, approval, agent_view
│   ├── passkey.py          WebAuthn: registro y firma ligada al checkout
│   ├── purchase.py         firma el mandato y completa (solo desde el endpoint humano)
│   ├── ap2/                SD-JWT ES256, firma de la tienda
│   ├── runstore/           Firestore (nube) o memoria (pruebas)
│   ├── audit.py            make audit
│   ├── bias_test.py        make bias-test
│   ├── stage.py            el día de la charla desde la página: despertar, estado, reiniciar, modo de control
│   ├── replay_check.py     huella de las grabaciones del plan B (catálogo + encargo)
│   ├── checkout_rules.py   revisión determinista del checkout antes de pedir la firma
│   ├── software_authenticator.py  passkey por software para grabar y probar
│   ├── mock_planner.py     MOCK_AI=1: planificador determinista con las mismas herramientas
│   └── api.py              FastAPI: /runs, SSE, /mandates, /passkeys, /stage, /audit, /.well-known/ucp
├── app/src/
│   ├── app/                /, /encargo/[id], /presenter, /configurar, /auditoria, /api/agent (proxy)
│   ├── components/         ErrandForm, RunPhone, Presenter, PasskeySetup, AuditView, PhoneTop, Logo, Icons
│   └── lib/                useRun (SSE), runState (eventos → pantalla), useReplay (plan B), stage, stageClient (preparar, reiniciar, habilitar con Touch ID), auditCopy
├── infra/                  10-enable-apis, 20-secrets, 30-deploy-stores, 40-deploy-agent, 50-deploy-app
├── scripts/                up.sh, reset.sh, record_replay.py, plan_b_video.py, e2e_passkey.py, e2e_emulator.py, demo_screens.py, generate_product_images.py
├── data/                   SOURCES.md, DATASHEET.md
└── docs/                   DEMO, ONBOARDING, DECISIONES, COMANDOS, ESTRUCTURA, CREDITOS (.md y .en.md), diagrams/, demo/, screenshots/
```
