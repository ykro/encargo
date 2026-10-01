# Encargo — the sneaker race. `make help` lists the targets.
SHELL := /bin/bash
URL ?= http://localhost:3001
RUNS ?= 10
TARGET ?= local

.PHONY: help up reset test bias-test audit images seed deploy screens e2e e2e-emulator phone

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


cloud_env = if [ "$(TARGET)" = cloud ]; then source infra/env.sh; source infra/urls.sh; \
	  export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	else export APP_URL=http://localhost:3000 AGENT_URL=http://localhost:8000 ADMIN_TOKEN=$${ADMIN_TOKEN:-dev-admin}; fi

screens: ## Drive the app in Chrome (virtual passkey) and screenshot every screen to docs/screenshots/app (TARGET=cloud)
	@$(cloud_env); cd agent && uv run python ../scripts/screens_app.py --app $$APP_URL --agent $$AGENT_URL --setup $$ADMIN_TOKEN

e2e: ## Passkey flow in Chrome with a virtual authenticator: enroll → errand → sign mandate → order (TARGET=cloud)
	@$(cloud_env); cd agent && uv run python ../scripts/e2e_passkey.py --app $$APP_URL --agent $$AGENT_URL --setup $$ADMIN_TOKEN

e2e-emulator: ## Phone side on the Android emulator (errand, progress, approval card, cancel) (TARGET=cloud)
	@$(cloud_env); cd agent && uv run python ../scripts/e2e_emulator.py --app $$APP_URL --try-passkey

phone: ## Open the signing "phone" on the laptop: Chrome window 390×844 (Touch ID passkey) (TARGET=cloud)
	@$(cloud_env); open -na "Google Chrome" --args --app="$$APP_URL" --window-size=390,844
