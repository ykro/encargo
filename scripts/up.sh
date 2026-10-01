#!/usr/bin/env bash
# `make up`: both stores and the agent, locally. Ctrl-C stops everything.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/.data/logs"; mkdir -p "$LOGS"
set -a; [ -f "$ROOT/.env" ] && source "$ROOT/.env"; set +a
trap 'kill 0' EXIT INT TERM

for dir in stores/shared stores/kilometro stores/pulso app; do
  [ -d "$ROOT/$dir/node_modules" ] || (cd "$ROOT/$dir" && npm ci --silent)
done
(cd "$ROOT/stores/kilometro" && npm run dev >"$LOGS/kilometro.log" 2>&1) &
(cd "$ROOT/stores/pulso" && npm run dev >"$LOGS/pulso.log" 2>&1) &
(cd "$ROOT/agent" && uv run uvicorn encargo.api:app --port 8000 >"$LOGS/agent.log" 2>&1) &
(cd "$ROOT/app" && npm run dev >"$LOGS/app.log" 2>&1) &

echo "Encargo    http://localhost:3000  (presentador: /presenter · passkey: /configurar?clave=$ADMIN_TOKEN)"
echo "Kilómetro  http://localhost:3001"
echo "Pulso      http://localhost:3002"
echo "Agente     http://localhost:8000  (logs en .data/logs/)"
wait
