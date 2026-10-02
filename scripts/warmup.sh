#!/usr/bin/env bash
# `make warmup`: wake every Encargo service and its cold paths before the talk —
# the stores' pages, feed and UCP profile, the app's phone and presenter pages,
# and on the agent one short Gemini call plus a headless Chromium launch.
# Local by default; `make warmup TARGET=cloud` warms Cloud Run (run `make stage-on` first).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; [ -f "$ROOT/.env" ] && source "$ROOT/.env"; set +a
if [ "${TARGET:-local}" = cloud ]; then
  source "$ROOT/infra/env.sh"; source "$ROOT/infra/urls.sh"
  ADMIN_TOKEN="$(gcloud secrets versions access latest --secret=encargo-admin-token)"
else
  PULSO_URL=http://localhost:3002 KILOMETRO_URL=http://localhost:3001 AGENT_URL=http://localhost:8000 APP_URL=http://localhost:3000
fi
failed=0
hit() {
  local label="$1" url="$2"; shift 2
  local out
  if out=$(curl -fsS -m 90 -o /dev/null -w '%{http_code} %{time_total}s' "$@" "$url" 2>&1); then
    printf '  %-34s %s\n' "$label" "$out"
  else
    printf '  %-34s FALLÓ (%s)\n' "$label" "$out"; failed=1
  fi
}
echo "Despertando servicios (${TARGET:-local})"
hit "Pulso /" "$PULSO_URL/"
hit "Kilómetro /productos/acatenango-t3" "$KILOMETRO_URL/productos/acatenango-t3"
hit "Kilómetro /feed.xml" "$KILOMETRO_URL/feed.xml"
hit "Kilómetro /.well-known/ucp" "$KILOMETRO_URL/.well-known/ucp"
hit "Agente /health" "$AGENT_URL/health"
hit "App / (teléfono)" "$APP_URL/"
hit "App /presenter" "$APP_URL/presenter"
hit "App /replays/kilometro.json" "$APP_URL/replays/kilometro.json"
echo "Modelo y navegador del agente"
body=$(curl -fsS -m 120 -XPOST -H "authorization: Bearer ${ADMIN_TOKEN:-dev-admin}" "$AGENT_URL/admin/warmup") || { echo "  warmup del agente FALLÓ"; exit 1; }
echo "  $body"
[ "$failed" -eq 0 ] || exit 1
echo "warmup ok"
