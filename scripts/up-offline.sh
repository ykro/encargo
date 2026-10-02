#!/usr/bin/env bash
# `make up-offline`: Plan B with no internet at all. Serves the app from the
# laptop (production build, fonts self-hosted) with the recorded replays, whose
# screenshots are embedded in the replay files. Nothing reaches the agent, the
# stores or Gemini: their URLs point to an unreachable address.
#   presenter: http://localhost:3000/presenter?demo=1   ·   phone: http://localhost:3000/?demo=1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
PORT="${PORT:-3000}"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "El puerto $PORT está ocupado. Detén lo que lo usa (lsof -i :$PORT) o usa PORT=…" >&2
  exit 1
fi
[ -d "$APP/node_modules" ] || (cd "$APP" && npm ci --silent)
if [ ! -f "$APP/.next/standalone/server.js" ] || [ -n "${REBUILD:-}" ]; then
  echo "Compilando la app una vez (necesita internet para las fuentes; después ya no)…"
  (cd "$APP" && npx next build >/dev/null)
fi
# The standalone server needs the static assets and public files (replays) next to it.
rm -rf "$APP/.next/standalone/.next/static" "$APP/.next/standalone/public"
cp -R "$APP/.next/static" "$APP/.next/standalone/.next/static"
cp -R "$APP/public" "$APP/.next/standalone/public"
echo "Plan B sin internet:"
echo "  Presentador  http://localhost:$PORT/presenter?demo=1   (o ?demo=pulso-control)"
echo "  Teléfono     http://localhost:$PORT/?demo=1"
echo "  Barra espaciadora: empezar / firmar a mano · Ctrl-C detiene"
cd "$APP/.next/standalone"
AGENT_URL=http://127.0.0.1:9 PULSO_URL=http://127.0.0.1:9/pulso KILOMETRO_URL=http://127.0.0.1:9/kilometro \
  APP_PUBLIC_HOST="localhost:$PORT" PORT="$PORT" HOSTNAME=127.0.0.1 exec node server.js
