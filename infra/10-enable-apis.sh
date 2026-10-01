#!/usr/bin/env bash
# Enables the Google Cloud APIs, creates the Artifact Registry repo and the
# Firestore database, and grants the runtime roles. Idempotent: safe to re-run.
source "$(dirname "$0")/env.sh"
say "Enabling APIs on ${PROJECT_ID}"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com --quiet

say "Artifact Registry repo ${AR_REPO}"
exists gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" || \
  gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location "$REGION" \
    --description "Charlas 2027 demo images" --quiet

say "Firestore database encargo"
exists gcloud firestore databases describe --database=encargo || \
  gcloud firestore databases create --database=encargo --location=nam5 --quiet

# The services run as the default compute service account: the agent reads and
# writes Firestore (runs, events, mandates, passkeys) and calls Gemini on Vertex.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for role in roles/datastore.user roles/aiplatform.user; do
  say "Granting ${role} to ${RUNTIME_SA}"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${RUNTIME_SA}" \
    --role="$role" --condition=None --quiet >/dev/null
done
