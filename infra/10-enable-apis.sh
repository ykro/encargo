#!/usr/bin/env bash
# Enables the Google Cloud APIs Encargo uses. Idempotent.
source "$(dirname "$0")/env.sh"
say "Enabling APIs on ${PROJECT_ID}"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com --quiet
exists gcloud firestore databases describe --database=encargo || \
  gcloud firestore databases create --database=encargo --location=nam5 --quiet
