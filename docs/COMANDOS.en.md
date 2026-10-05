# Commands

Every `Makefile` command. `make help` lists them with their description. Back to the [README](../README.en.md). [Versión en español](COMANDOS.md).

Variables: `TARGET=local|cloud` (default `local`), `URL` (default `http://localhost:3001`) and `RUNS` (default `10`).

| Command | What it does |
| --- | --- |
| `make help` | Lists the commands with their descriptions. |
| `make up` | Starts the app (3000), Kilómetro (3001), Pulso (3002) and the agent (8000) locally. Logs go to `.data/logs/`. Ctrl-C stops everything. |
| `make reset` | Back to the initial state: seed stock; no carts, checkouts or orders; Pulso opaque; no runs, events, mandates or screenshots. Passkeys are kept. It waits for every call and fails (naming the service) if any fails; only then it prints `reset ok`. `TARGET=cloud` resets the Cloud Run services. |
| `make test` | Commerce kit (vitest), store and app typecheck, agent (pytest with `MOCK_AI=1`, in-memory run store, no browser). |
| `make e2e` | Passkey flow in Chrome with the DevTools virtual authenticator: enroll → send the errand → sign the mandate → order confirmed. Removes the credential at the end. |
| `make e2e-emulator` | Phone side on the Android emulator (`emulator-5556`): errand, progress, approval card and cancel. Saves screenshots to `docs/screenshots/emulator/`. Defaults to Cloud Run (the emulator cannot reach the laptop's `localhost`); `TARGET=local` maps port 3000 with `adb reverse`. |
| `make bias-test` | 10 runs with control mode off (expects Kilómetro) and 10 with it on (expects Pulso). Each run goes from errand to passkey signature to order. Writes the report to `bias-results/`. |
| `make audit URL=…` | Agent-readiness checklist for any store. |
| `make phone` | Opens the signing "phone": a 390×844 Chrome app window, with the Mac's passkey (Touch ID). |
| `make stage-on` / `make stage-off` | Talk day: one minimum instance on the four services / any other day: 0 (nothing bills around the clock). |
| `make warmup` | Wakes every service, makes one short Gemini call and launches Chromium on the agent. With `TARGET=cloud`, after `stage-on`. |
| `make record-replay` | Records a real cloud run (events and screenshots) as the Plan B in `app/public/replays/`. |
| `make preflight` | Talk-day gate: fails if a service is unhealthy, no passkey is registered, control mode is on, `min-instances=1` is missing, a recording no longer matches the catalog and errand (or the deployed app serves another copy) or size-9 stock is low. |
| `make up-offline` / `make e2e-offline` | Plan B without internet: app and recordings from the laptop / the test with the network cut (`VIDEO=1` re-renders the MP4). |
| `make control-on` / `make control-off` | Turns control mode on or off live (`TARGET=cloud` for the cloud). |
| `make demo-screens` | Captures `docs/demo/` from two real cloud runs (the demo script). |
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

- Open `http://localhost:3000/configurar?clave=dev-admin` and register a passkey (Touch ID). In the cloud, the same link (with the real `ADMIN_TOKEN`) also enables the device to start errands.
- Send the errand from `http://localhost:3000` and watch it at `http://localhost:3000/presenter`.
- `make test` runs every test offline.

Details (prerequisites, cloud, rehearsal and talk day) are in [ONBOARDING.md](ONBOARDING.md).
