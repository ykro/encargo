# Commands

Every `Makefile` command. `make help` lists them with their description. Back to the [README](../README.en.md). [Versión en español](COMANDOS.md).

Variables: `TARGET=local|cloud` (default `local`), `URL` (default `http://localhost:3001`) and `RUNS` (default `10`).

On talk day no command is run: you open the pages, and the presenter page wakes and checks everything by itself ([DEMO.en.md](DEMO.en.md)). These commands are for developing, testing and deploying.

| Command | What it does |
| --- | --- |
| `make help` | Lists the commands with their descriptions. |
| `make up` | Starts the app (3000), Kilómetro (3001), Pulso (3002) and the agent (8000) locally. Logs go to `.data/logs/`. Ctrl-C stops everything. |
| `make reset` | Development: back to the initial state (on stage the presenter's «Empezar de nuevo» button does it): seed stock; no carts, checkouts or orders; Pulso opaque; no runs, events, mandates or screenshots. Passkeys are kept. It waits for every call and fails (naming the service) if any fails; only then it prints `reset ok`. `TARGET=cloud` resets the Cloud Run services. |
| `make test` | Commerce kit (vitest), store and app typecheck, agent (pytest with `MOCK_AI=1`, in-memory run store, no browser). |
| `make e2e` | Passkey flow in Chrome with the DevTools virtual authenticator: enroll → send the errand → sign the mandate → order confirmed. Removes the credential at the end. |
| `make e2e-emulator` | Phone side on the Android emulator (`Pixel_9_API_36_1`; if it has a screen PIN it unlocks it with `EMULATOR_PIN`, 1234 by default): errand, progress, approval card and cancel. Saves screenshots to `docs/screenshots/emulator/`. Defaults to Cloud Run (the emulator cannot reach the laptop's `localhost`); `TARGET=local` maps port 3000 with `adb reverse`. |
| `make bias-test` | 10 runs with control mode off (expects Kilómetro) and 10 with it on (expects Pulso). Each run goes from errand to passkey signature to order. Writes the report to `bias-results/`. |
| `make audit URL=…` | Agent-readiness checklist for any store. |
| `make record-replay` | Records a real cloud run (events and screenshots) as the Plan B in `app/public/replays/`. Then `./infra/50-deploy-app.sh`; `make test` fails if a recording no longer matches the catalog and errand. |
| `make plan-b-video` | Plan B on Cloud Run from the presenter's «Ver la ejecución grabada» button: the phone follows and signs with a virtual passkey. `VIDEO=1` re-renders `docs/plan-b-replay.mp4`. |
| `make demo-screens` | The whole demo on Cloud Run, clicks only and the way the presenter does it (best from a cold start), saving `docs/demo/`. |
| `make seed` | Regenerates `catalog/catalog.json` (deterministic, seed 2027). |
| `make images` | Generates product photos and Pulso ads with `IMAGE_MODEL`, verified with `GEMINI_MODEL`. |
| `make deploy` | Runs `infra/10` to `infra/50`: APIs, secrets, stores, agent and app on Cloud Run. |

## Quickstart

```bash
cp .env.example .env                       # models, local URLs and development tokens
gcloud auth application-default login      # ADC for Gemini on Vertex AI (or MOCK_AI=1 in .env)
(cd agent && uv run playwright install chromium)
make up                                    # app :3000, Kilómetro :3001, Pulso :3002, agent :8000
```

- Open `http://localhost:3000/configurar?clave=dev-admin` and register a passkey (Touch ID). In the cloud one is already registered; a new browser is enabled from the phone page with «Habilitar con Touch ID».
- Send the errand from `http://localhost:3000` and watch it at `http://localhost:3000/presentador`.
- `make test` runs every test offline.

Details (prerequisites, cloud, rehearsal and talk day) are in [ONBOARDING.md](ONBOARDING.md).
