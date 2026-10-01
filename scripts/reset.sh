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

# All resets run in parallel (well under 10 s); every one must succeed.
pids=() names=()
call() { local name="$1"; shift; curl -fs -m 8 -o /dev/null "$@" & pids+=($!); names+=("$name"); }
call "Pulso: stock, carritos y pedidos" -XPOST "${auth[@]}" "$PULSO_URL/api/admin/reset"
call "Kilómetro: stock, carritos y pedidos" -XPOST "${auth[@]}" "$KILOMETRO_URL/api/admin/reset"
call "Pulso: modo de control apagado" -XPOST "${auth[@]}" -H 'content-type: application/json' -d '{"enabled":false}' "$PULSO_URL/api/admin/agent-ready"
call "Agente: encargos, eventos, mandatos y pedidos" -XPOST "${auth[@]}" "$AGENT_URL/admin/reset"

failed=0
for i in "${!pids[@]}"; do
  if ! wait "${pids[$i]}"; then echo "reset FALLÓ: ${names[$i]}" >&2; failed=1; fi
done
[ "$failed" -eq 0 ] || exit 1
echo "reset ok (${TARGET:-local})"
