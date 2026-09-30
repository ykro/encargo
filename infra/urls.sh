#!/usr/bin/env bash
# Cloud Run URLs are deterministic (https://SERVICE-PROJECT_NUMBER.REGION.run.app),
# so every service can know the others before they exist.
PROJECT_NUMBER="${PROJECT_NUMBER:-$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')}"
run_url() { echo "https://$1-${PROJECT_NUMBER}.${REGION}.run.app"; }
export PULSO_URL="$(run_url encargo-pulso)"
export KILOMETRO_URL="$(run_url encargo-kilometro)"
export AGENT_URL="$(run_url encargo-agent)"
export APP_URL="$(run_url encargo-app)"
