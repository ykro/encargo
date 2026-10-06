#!/usr/bin/env bash
# Deploys the Encargo app (phone + presenter + audit). Its run.app hostname is
# the passkey RP ID, so the agent is deployed with PASSKEY_RP_ID/ORIGIN = this URL.
source "$(dirname "$0")/env.sh"
source "$INFRA_DIR/urls.sh"
REPO_DIR="$(cd "$INFRA_DIR/.." && pwd)"

deploy_run encargo-app "$REPO_DIR/app" \
  --allow-unauthenticated --min-instances "${MIN_INSTANCES:-0}" --max-instances 2 --memory 512Mi \
  --set-env-vars "AGENT_URL=$AGENT_URL,PULSO_URL=$PULSO_URL,KILOMETRO_URL=$KILOMETRO_URL,APP_PUBLIC_HOST=${APP_URL#https://}"
say "Only if no passkey is registered yet (the presenter page says so): register Touch ID once at $APP_URL/configurar?clave=\$(gcloud secrets versions access latest --secret=encargo-admin-token) — see docs/DECISIONES.md «Quién firma»"
