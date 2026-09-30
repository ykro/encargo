# Encargo — the sneaker race. `make help` lists the targets.
SHELL := /bin/bash
URL ?= http://localhost:3001
RUNS ?= 10
TARGET ?= local

.PHONY: help up reset test bias-test audit images seed deploy

help:
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/'

up: ## Start Kilómetro (3001), Pulso (3002) and the agent (8000) locally
	@./scripts/up.sh

reset: ## Back to the initial state: seed stock, no carts/orders/events, Pulso opaque (TARGET=cloud for Cloud Run)
	@TARGET=$(TARGET) ./scripts/reset.sh

test: ## Commerce kit (vitest), store typecheck, agent (pytest, MOCK_AI)
	cd stores/shared && npm test --silent
	cd stores/kilometro && npm run --silent typecheck
	cd stores/pulso && npm run --silent typecheck
	cd agent && uv run pytest -q

bias-test: ## 10 runs control off (expect Kilómetro) + 10 on (expect Pulso), errand → order (TARGET=cloud)
	@set -a; [ -f .env ] && source .env; set +a; \
	if [ "$(TARGET)" = cloud ]; then source infra/env.sh; source infra/urls.sh; \
	  export ADMIN_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-admin-token); \
	  export HUMAN_APPROVAL_TOKEN=$$(gcloud secrets versions access latest --secret=encargo-human-token); fi; \
	cd agent && uv run python -m encargo.bias_test --runs $(RUNS) --out ../bias-results/$(TARGET)-$$(date +%Y%m%d-%H%M%S).json

audit: ## Agent-readiness checklist for any store: make audit URL=https://…
	@cd agent && uv run python -m encargo.audit $(URL)

seed: ## Regenerate catalog/catalog.json (deterministic)
	uv run catalog/seed.py

images: ## Generate product photos + Pulso variants with IMAGE_MODEL (verified with GEMINI_MODEL)
	@set -a; source .env; set +a; uv run scripts/generate_product_images.py

deploy: ## Cloud Run: APIs, secrets, stores, agent (infra/NN-*.sh)
	./infra/10-enable-apis.sh
	./infra/20-secrets.sh
	./infra/30-deploy-stores.sh
	./infra/40-deploy-agent.sh
