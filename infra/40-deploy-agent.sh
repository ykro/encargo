#!/usr/bin/env bash
# Deploys the Encargo agent. Always-on CPU (runs continue after POST /runs
# returns) and a single instance (runs execute in-process; state is in Firestore).
source "$(dirname "$0")/env.sh"
source "$INFRA_DIR/urls.sh"
REPO_DIR="$(cd "$INFRA_DIR/.." && pwd)"
# Model names come from the environment (.env), never from code.
[ -f "$REPO_DIR/.env" ] && GEMINI_MODEL="${GEMINI_MODEL:-$(grep -E '^GEMINI_MODEL=' "$REPO_DIR/.env" | cut -d= -f2)}"
: "${GEMINI_MODEL:?set GEMINI_MODEL}"

deploy_run encargo-agent "$REPO_DIR/agent" \
  --allow-unauthenticated --min-instances 1 --max-instances 1 --no-cpu-throttling \
  --cpu 2 --memory 2Gi --timeout 3600 \
  --set-env-vars "^|^GEMINI_MODEL=$GEMINI_MODEL|GOOGLE_GENAI_USE_VERTEXAI=true|GOOGLE_CLOUD_PROJECT=$PROJECT_ID|GOOGLE_CLOUD_LOCATION=global|RUN_STORE=firestore|FIRESTORE_DATABASE=encargo|AGENT_PUBLIC_URL=$AGENT_URL|STORE_URLS=$PULSO_URL,$KILOMETRO_URL|SIGNER_MODE=test|MOCK_AI=0" \
  --set-secrets "HUMAN_APPROVAL_TOKEN=encargo-human-token:latest,PLATFORM_SIGNING_JWK=encargo-platform-jwk:latest,ADMIN_TOKEN=encargo-admin-token:latest"
