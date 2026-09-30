#!/usr/bin/env bash
# Deploys Pulso and Kilómetro. Each runs as a single instance: its SQLite state
# and merchant key live in the process (`make reset` restores the seed).
source "$(dirname "$0")/env.sh"
source "$INFRA_DIR/urls.sh"
REPO_DIR="$(cd "$INFRA_DIR/.." && pwd)"
PULSO_AGENT_READY="${PULSO_AGENT_READY:-false}"

for store in pulso kilometro; do
  (cd "$REPO_DIR/stores/$store" && npm run --silent sync)
  deploy_run "encargo-$store" "$REPO_DIR/stores/$store" \
    --allow-unauthenticated --min-instances 1 --max-instances 1 --memory 512Mi \
    --set-env-vars "STORE_KEY=$store,PULSO_AGENT_READY=$PULSO_AGENT_READY,TRUSTED_PLATFORM_PROFILES=$AGENT_URL/.well-known/ucp" \
    --set-secrets "ADMIN_TOKEN=encargo-admin-token:latest"
done
