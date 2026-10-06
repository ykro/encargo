# Encargo — the sneaker race. `make help` lists the targets.
SHELL := /bin/bash
URL ?= http://localhost:3001
RUNS ?= 10
TARGET ?= local

.PHONY: help up reset test bias-test audit images seed deploy e2e e2e-emulator phone stage-on stage-off warmup record-replay preflight up-offline e2e-offline control-on control-off demo-screens

help:
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/'

up: ## Start the app (3000), Kilómetro (3001), Pulso (3002) and the agent (8000) locally
	@./scripts/up.sh

reset: ## Back to the initial state: seed stock, no carts/orders/events, Pulso opaque (TARGET=cloud for Cloud Run)
	@TARGET=$(TARGET) ./scripts/reset.sh

test: ## Commerce kit (vitest), stores + app typecheck, agent (pytest, MOCK_AI)
	cd stores/shared && npm test --silent
	cd stores/kilometro && npm run --silent typecheck
	cd stores/pulso && npm run --silent typecheck
	cd app && npx tsc --noEmit
	cd agent && uv run pytest -q

bias-test: ## 10 runs control off (expect Kilómetro) + 10 on (expect Pulso), errand → passkey → order (TARGET=cloud)
	@set -a; [ -f .env ] && source .env; set +a; \
	if [ "$(TARGET)" = cloud ]; then source infra/env.sh; source infra/urls.sh; \
	  export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	  export PASSKEY_ORIGIN=$$APP_URL; fi; \
	cd agent && uv run python -m encargo.bias_test --runs $(RUNS) --out ../bias-results/$(TARGET)-$$(date +%Y%m%d-%H%M%S).json

audit: ## Agent-readiness checklist for any store: make audit URL=https://…
	@cd agent && uv run python -m encargo.audit $(URL)

seed: ## Regenerate catalog/catalog.json (deterministic)
	uv run catalog/seed.py

images: ## Generate product photos + Pulso variants with IMAGE_MODEL (verified with GEMINI_MODEL)
	@set -a; source .env; set +a; uv run scripts/generate_product_images.py

deploy: ## Cloud Run: APIs, secrets, stores, agent, app (infra/NN-*.sh)
	./infra/10-enable-apis.sh
	./infra/20-secrets.sh
	./infra/30-deploy-stores.sh
	./infra/40-deploy-agent.sh
	./infra/50-deploy-app.sh


# APP_URL / AGENT_URL given on the command line win over the TARGET defaults.
# (Not APP: infra/app.env already uses APP=encargo for the service prefix.)
cloud_env = app_override="$(APP_URL)"; agent_override="$(AGENT_URL)"; \
	if [ "$(TARGET)" = cloud ]; then source infra/env.sh; source infra/urls.sh; \
	  export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	else export APP_URL=http://localhost:3000 AGENT_URL=http://localhost:8000 ADMIN_TOKEN=$${ADMIN_TOKEN:-dev-admin}; fi; \
	export APP_URL=$${app_override:-$$APP_URL} AGENT_URL=$${agent_override:-$$AGENT_URL}

e2e: ## Passkey flow in Chrome with a virtual authenticator: enroll → errand → sign mandate → order (TARGET=cloud)
	@$(cloud_env); cd agent && uv run python ../scripts/e2e_passkey.py --app $$APP_URL --agent $$AGENT_URL --setup $$ADMIN_TOKEN

# The emulator cannot reach the laptop's localhost, so this target defaults to the
# cloud. TARGET=local maps the app port into the emulator with `adb reverse`.
e2e-emulator: TARGET = cloud
e2e-emulator: ## Phone side on the Android emulator (errand, progress, approval, cancel); cloud by default, TARGET=local uses adb reverse
	@$(cloud_env); if [ "$(TARGET)" = local ]; then adb -s $${ANDROID_SERIAL:-$$(adb devices | awk '/^emulator-.*\tdevice$$/{print $$1; exit}')} reverse tcp:3000 tcp:3000; fi; \
	cd agent && uv run python ../scripts/e2e_emulator.py --app $$APP_URL --setup $$ADMIN_TOKEN --try-passkey

phone: ## Open the signing "phone" on the laptop: Chrome window 390×844 (Touch ID passkey) (TARGET=cloud)
	@$(cloud_env); open -na "Google Chrome" --args --app="$$APP_URL" --window-size=390,844

stage-on: ## Talk day: min-instances=1 on the 4 Cloud Run services (no cold starts)
	./infra/60-stage.sh on

stage-off: ## Any other day: min-instances=0 on the 4 services (nothing bills 24/7)
	./infra/60-stage.sh off

record-replay: ## Record a real cloud run (events + screenshots) as the Plan B replay in app/public/replays
	@source infra/env.sh; source infra/urls.sh; export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	cd agent && uv run python ../scripts/record_replay.py --agent $$AGENT_URL --pulso $$PULSO_URL --kilometro $$KILOMETRO_URL --origin $$APP_URL

warmup: ## Wake every service + one model call + Chromium before the talk (TARGET=cloud after stage-on)
	@TARGET=$(TARGET) ./scripts/warmup.sh

preflight: ## Talk-day gate (Cloud Run): health, passkey, control off, warm instances, fresh replays, size-9 stock
	@source infra/env.sh; source infra/urls.sh; export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	cd agent && uv run python -m encargo.preflight --agent $$AGENT_URL --pulso $$PULSO_URL --kilometro $$KILOMETRO_URL --app $$APP_URL

up-offline: ## Plan B with no internet: the app + recorded replays from the laptop (presenter ?demo=1, phone ?demo=1)
	@./scripts/up-offline.sh

e2e-offline: ## Plan B test with the network cut: replay end to end, real passkey (virtual authenticator); VIDEO=1 renders docs/plan-b-replay.mp4
	@cd agent && uv run python ../scripts/e2e_offline.py $${VIDEO:+--video}

control-on: ## Control mode ON: Pulso publishes the same machine layer as Kilómetro (TARGET=cloud for Cloud Run)
	@$(cloud_env); curl -fsS -XPOST -H "authorization: Bearer $$ADMIN_TOKEN" -H 'content-type: application/json' \
	  -d '{"enabled":true}' "$${PULSO_URL:-http://localhost:3002}/api/admin/agent-ready"; echo

control-off: ## Control mode OFF: Pulso opaque again (also done by make reset)
	@$(cloud_env); curl -fsS -XPOST -H "authorization: Bearer $$ADMIN_TOKEN" -H 'content-type: application/json' \
	  -d '{"enabled":false}' "$${PULSO_URL:-http://localhost:3002}/api/admin/agent-ready"; echo

demo-screens: ## Capture docs/demo/NN-*.png from a real Cloud Run run (virtual authenticator signs; resets after)
	@source infra/env.sh; source infra/urls.sh; export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	TARGET=cloud ./scripts/reset.sh >/dev/null; \
	cd agent && uv run python ../scripts/demo_screens.py --app $$APP_URL --agent $$AGENT_URL --pulso $$PULSO_URL --admin-token $$ADMIN_TOKEN; \
	cd .. && TARGET=cloud ./scripts/reset.sh
