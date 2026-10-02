# Encargo — the sneaker race

Demo for the talk **"Your Next Customer Is an AI Agent."** Encargo is an agent that shops for a person: "Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes" (trail shoes, size 9, under 150 USD, arriving before Friday). Two fictional stores sell the same shoes. **Pulso** is cheaper (139 USD), but only a person can read it: its data lives in photos and a `canvas`. **Kilómetro** costs 145 USD, but it is agent-ready (schema.org, feed, UCP and AP2). Encargo buys from Kilómetro because it is the only store where it can verify everything. With control mode on, Pulso publishes the same data and Encargo buys there, because it is cheaper.

The Spanish [README.md](README.md) is the primary document; this is a faithful English version.

## What you'll learn

1. **Agents read data, not marketing:** a fact that only appears inside an image does not count.
2. **The funnel collapses:** seven screens for a person, three steps for the agent.
3. **Control mode proves the agent has no bias:** given the same data, it buys where it is cheaper.
4. **Trust:** the agent builds the cart, but only a passkey signs the AP2 mandate that pays.
5. **The practical checklist:** `make audit` scores any store on eight points.

![Encargo architecture](docs/diagrams/architecture.png)

![What the demo tests](docs/diagrams/que-se-prueba.png)

## Quickstart

```bash
cp .env.example .env                       # models, local URLs and development tokens
gcloud auth application-default login      # ADC for Gemini on Vertex AI (or MOCK_AI=1 in .env)
(cd agent && uv run playwright install chromium)
make up                                    # app :3000, Kilómetro :3001, Pulso :3002, agent :8000
open "http://localhost:3000/configurar?clave=dev-admin"   # register a passkey (Touch ID)
open http://localhost:3000/presenter       # send the errand from http://localhost:3000
make test                                  # every test, offline
```

**Bias test** (`make bias-test TARGET=cloud`, 2026-10-01): Kilómetro 9/10 with control off and Pulso 10/10 with control on, every run under 120 s ([details](docs/DECISIONES.en.md#bias-test-results)).

## Deployed URLs

| Service | URL |
| --- | --- |
| App (phone) | https://encargo-app-611681112050.us-central1.run.app |
| Presenter | https://encargo-app-611681112050.us-central1.run.app/presenter |
| Audit | https://encargo-app-611681112050.us-central1.run.app/auditoria |
| Kilómetro | https://encargo-kilometro-611681112050.us-central1.run.app |
| Pulso | https://encargo-pulso-611681112050.us-central1.run.app |
| Agent | https://encargo-agent-611681112050.us-central1.run.app (`/health`, `/.well-known/ucp`) |

Use these URLs, not the `…-uc.a.run.app` aliases: the passkey is bound to the app's host name (RP ID), and on another host the signature fails.

## Documentation

- [docs/DEMO.md](docs/DEMO.md): demo script with screenshots, talk points, timings and what to do if something fails (Spanish).
- [docs/ONBOARDING.md](docs/ONBOARDING.md): setup, cloud, tests, code walkthrough, troubleshooting and talk-day checklist (Spanish).
- [docs/DECISIONES.en.md](docs/DECISIONES.en.md): what the demo teaches in detail, every technical decision, UCP and AP2 versions, and bias-test results.
- [docs/COMANDOS.en.md](docs/COMANDOS.en.md): every `make` command.
- [docs/ESTRUCTURA.en.md](docs/ESTRUCTURA.en.md): components, services and repo map.
- [docs/CREDITOS.en.md](docs/CREDITOS.en.md): image and data provenance.
- [VERSIONS.md](VERSIONS.md): protocol and dependency versions (Spanish).
- [docs/diagrams/](docs/diagrams/): architecture, what the demo tests, sequence of one purchase, readability matrix and funnel (HTML, SVG and PNG).
- [data/SOURCES.md](data/SOURCES.md) and [data/DATASHEET.md](data/DATASHEET.md): synthetic data.
