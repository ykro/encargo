#!/usr/bin/env bash
# Creates the secrets the services share (once) and lets the runtime service
# account read them. Nothing secret is ever written to the repo.
#   encargo-platform-jwk  — the agent's AP2 mandate signing key (private EC P-256 JWK)
#   encargo-human-token   — test-mode signer token (only honored when SIGNER_MODE=test; the cloud uses passkeys)
#   encargo-admin-token   — `make reset` / control mode
source "$(dirname "$0")/env.sh"
REPO_DIR="$(cd "$INFRA_DIR/.." && pwd)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

create_secret() {
  local name="$1" value="$2"
  if ! exists gcloud secrets describe "$name"; then
    say "Creating secret ${name}"
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --quiet
  fi
  gcloud secrets add-iam-policy-binding "$name" --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
}

PLATFORM_JWK="$(cd "$REPO_DIR/agent" && uv run --quiet python -c \
  'from encargo.ap2.signer import platform_key; print(platform_key().export_private())')"
create_secret encargo-platform-jwk "$PLATFORM_JWK"
create_secret encargo-human-token "$(openssl rand -hex 24)"
create_secret encargo-admin-token "$(openssl rand -hex 24)"
say "Secrets ready. Read the tokens with: gcloud secrets versions access latest --secret=encargo-human-token"
