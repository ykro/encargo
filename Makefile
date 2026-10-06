# Encargo — the sneaker race. `make help` lists the targets.
SHELL := /bin/bash
URL ?= http://localhost:3001
RUNS ?= 10
TARGET ?= local

.PHONY: help up reset test bias-test audit images seed deploy e2e e2e-emulator record-replay plan-b-video demo-screens

help:
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/'

up: ## Start the app (3000), Kilómetro (3001), Pulso (3002) and the agent (8000) locally
	@./scripts/up.sh

reset: ## Development: back to the initial state (TARGET=cloud for Cloud Run; on stage the presenter's «Empezar de nuevo» does it)
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

record-replay: ## Record a real cloud run (events + screenshots) as the Plan B replay in app/public/replays (then ./infra/50-deploy-app.sh)
	@source infra/env.sh; source infra/urls.sh; export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	cd agent && uv run python ../scripts/record_replay.py --agent $$AGENT_URL --pulso $$PULSO_URL --kilometro $$KILOMETRO_URL --origin $$APP_URL

plan-b-video: ## Plan B on Cloud Run from the presenter's button, phone signs with a virtual passkey; VIDEO=1 renders docs/plan-b-replay.mp4
	@source infra/env.sh; source infra/urls.sh; cd agent && uv run python ../scripts/plan_b_video.py --app $$APP_URL $${VIDEO:+--video}

demo-screens: ## The whole demo on Cloud Run with clicks only (best from a cold start), saving docs/demo/NN-*.png
	@source infra/env.sh; source infra/urls.sh; export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	cd agent && uv run python ../scripts/demo_screens.py --app $$APP_URL --agent $$AGENT_URL --pulso $$PULSO_URL --admin-token $$ADMIN_TOKEN
