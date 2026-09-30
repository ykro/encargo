#!/usr/bin/env bash
# `make reset`: stores back to seed stock (no carts, checkouts or orders), Pulso
# back to opaque, and run state (runs, events, mandates, orders) cleared.
# Local by default; `make reset TARGET=cloud` resets the Cloud Run services.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; [ -f "$ROOT/.env" ] && source "$ROOT/.env"; set +a
if [ "${TARGET:-local}" = cloud ]; then
  source "$ROOT/infra/env.sh"; source "$ROOT/infra/urls.sh"
  ADMIN_TOKEN="$(gcloud secrets versions access latest --secret=encargo-admin-token)"
else
  PULSO_URL=http://localhost:3002 KILOMETRO_URL=http://localhost:3001 AGENT_URL=http://localhost:8000
fi
auth=(-H "authorization: Bearer ${ADMIN_TOKEN:-dev-admin}")
for url in "$PULSO_URL" "$KILOMETRO_URL"; do curl -fsS -m 8 -XPOST "${auth[@]}" "$url/api/admin/reset" >/dev/null & done
curl -fsS -m 8 -XPOST "${auth[@]}" -H 'content-type: application/json' -d '{"enabled":false}' "$PULSO_URL/api/admin/agent-ready" >/dev/null &
curl -fsS -m 8 -XPOST "${auth[@]}" "$AGENT_URL/admin/reset" >/dev/null &
wait
echo "reset ok (${TARGET:-local})"
