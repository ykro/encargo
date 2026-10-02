#!/usr/bin/env bash
# Talk days: keep one warm instance of every Encargo service (no cold starts on
# stage). Other days: scale to zero so nothing bills around the clock.
#   ./infra/60-stage.sh on | off
source "$(dirname "$0")/env.sh"
mode="${1:?usage: 60-stage.sh on|off}"
case "$mode" in
  on) min=1 ;;
  off) min=0 ;;
  *) echo "usage: 60-stage.sh on|off" >&2; exit 2 ;;
esac
pids=()
for svc in encargo-pulso encargo-kilometro encargo-agent encargo-app; do
  say "${svc}: min-instances=${min}"
  gcloud run services update "$svc" --region "$REGION" --min-instances "$min" --quiet >/dev/null &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
gcloud run services list --region "$REGION" --filter="metadata.name~^encargo-" \
  --format='table(metadata.name, spec.template.metadata.annotations."autoscaling.knative.dev/minScale":label=MIN)'
