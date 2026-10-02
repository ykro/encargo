"""Talk-day gate: everything the live demo needs, checked in one go.

  make preflight        (against Cloud Run; the first step of the talk-day checklist)

Fails (exit 1) with one clear Spanish line per problem:
  - a service is not healthy, or the agent is not in Gemini/passkey mode
  - no passkey is registered (nobody could sign on stage)
  - control mode is on (the talk starts with Pulso opaque)
  - a service is not kept warm (min-instances must be 1: run `make stage-on`)
  - the Plan B recordings are older than 7 days (dates on screen would be stale)
  - size-9 stock of the errand model is low at a store
"""

from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

import httpx

SERVICES = ["encargo-pulso", "encargo-kilometro", "encargo-agent", "encargo-app"]
REPLAYS = ["kilometro", "pulso-control"]
ERRAND_VARIANT = "SND-001-9"
MIN_STOCK = 10
MAX_REPLAY_AGE = timedelta(days=7)


class Report:
    def __init__(self) -> None:
        self.failures = 0

    def ok(self, text: str) -> None:
        print(f"  [ok]    {text}", flush=True)

    def fail(self, text: str, fix: str) -> None:
        self.failures += 1
        print(f"  [FALLA] {text}\n          → {fix}", flush=True)


def min_instances(service: str, region: str) -> str:
    out = subprocess.run(
        ["gcloud", "run", "services", "describe", service, "--region", region,
         "--format=value(spec.template.metadata.annotations.'autoscaling.knative.dev/minScale')"],
        capture_output=True, text=True,
    )
    return out.stdout.strip() if out.returncode == 0 else f"error: {out.stderr.strip()[:80]}"


async def main(a: argparse.Namespace) -> int:
    r = Report()
    admin = {"authorization": f"Bearer {a.admin_token}"}
    async with httpx.AsyncClient(timeout=30) as http:
        print("Servicios", flush=True)
        for label, url in [("Pulso", a.pulso + "/robots.txt"), ("Kilómetro", a.kilometro + "/robots.txt"), ("App", a.app + "/")]:
            try:
                res = await http.get(url)
                if res.status_code == 200:
                    r.ok(f"{label} responde 200")
                else:
                    r.fail(f"{label} responde {res.status_code}", "revisa el servicio en Cloud Run")
            except httpx.HTTPError as e:
                r.fail(f"{label} no responde ({e.__class__.__name__})", "revisa el servicio en Cloud Run y la conexión")
        try:
            health = (await http.get(a.agent + "/health")).json()
            if health.get("mode") == "gemini":
                r.ok("Agente responde en modo Gemini")
            else:
                r.fail(f"El agente está en modo {health.get('mode')}", "despliega con MOCK_AI=0 (infra/40-deploy-agent.sh)")
        except (httpx.HTTPError, ValueError) as e:
            r.fail(f"El agente no responde ({e.__class__.__name__})", "revisa encargo-agent en Cloud Run")

        print("Firma", flush=True)
        try:
            status = (await http.get(a.agent + "/passkeys/status", headers=admin)).json()
            if status.get("registered", 0) >= 1:
                r.ok(f"{status['registered']} passkey(s) registrada(s): {', '.join(status.get('labels') or [])}")
            else:
                r.fail("No hay ninguna passkey registrada: nadie podría firmar en el escenario", f"abre {a.app}/configurar?clave=… en el portátil y registra Touch ID")
        except (httpx.HTTPError, ValueError) as e:
            r.fail(f"No se pudo leer el estado de las passkeys ({e.__class__.__name__})", "revisa el agente y ADMIN_TOKEN")

        print("Modo de control", flush=True)
        try:
            ready = (await http.get(a.pulso + "/api/admin/agent-ready")).json().get("agent_ready")
            if ready:
                r.fail("El modo de control está ENCENDIDO: Pulso ya es legible para agentes", "make reset TARGET=cloud (lo apaga)")
            else:
                r.ok("Modo de control apagado (Pulso opaco)")
        except (httpx.HTTPError, ValueError) as e:
            r.fail(f"No se pudo leer el modo de control ({e.__class__.__name__})", "revisa encargo-pulso")

        print("Stock de la talla 9 del modelo del encargo", flush=True)
        for label, url in [("Pulso", a.pulso), ("Kilómetro", a.kilometro)]:
            try:
                qty = (await http.get(f"{url}/api/admin/stock", params={"variant": ERRAND_VARIANT}, headers=admin)).json().get("qty", 0)
                if qty >= MIN_STOCK:
                    r.ok(f"{label}: {qty} pares")
                else:
                    r.fail(f"{label}: solo {qty} pares de talla 9", "make reset TARGET=cloud (restaura el stock)")
            except (httpx.HTTPError, ValueError) as e:
                r.fail(f"{label}: no se pudo leer el stock ({e.__class__.__name__})", "revisa la tienda y ADMIN_TOKEN")

        print("Plan B (repeticiones grabadas)", flush=True)
        now = datetime.now(timezone.utc)
        for name in REPLAYS:
            try:
                body = (await http.get(f"{a.app}/replays/{name}.json")).json()
                recorded = datetime.fromisoformat(body["recorded_at"])
                age = now - recorded
                if age <= MAX_REPLAY_AGE:
                    r.ok(f"{name}: grabada hace {age.days} día(s)")
                else:
                    r.fail(f"{name}: grabada hace {age.days} días (muestra fechas viejas)", "make record-replay y vuelve a desplegar la app")
            except (httpx.HTTPError, ValueError, KeyError) as e:
                r.fail(f"{name}: no se pudo leer la grabación ({e.__class__.__name__})", "make record-replay y vuelve a desplegar la app")

    print("Instancias tibias (min-instances = 1)", flush=True)
    for svc in SERVICES:
        value = min_instances(svc, a.region)
        if value == "1":
            r.ok(f"{svc}: 1")
        else:
            r.fail(f"{svc}: min-instances = {value or 0}", "make stage-on")

    print()
    if r.failures:
        print(f"preflight FALLÓ: {r.failures} problema(s). Corrígelos antes de subir al escenario.")
        return 1
    print("preflight ok: listo para la charla.")
    return 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--agent", default=os.getenv("AGENT_URL", ""))
    p.add_argument("--pulso", default=os.getenv("PULSO_URL", ""))
    p.add_argument("--kilometro", default=os.getenv("KILOMETRO_URL", ""))
    p.add_argument("--app", default=os.getenv("APP_URL", ""))
    p.add_argument("--admin-token", default=os.getenv("ADMIN_TOKEN", ""))
    p.add_argument("--region", default=os.getenv("REGION", "us-central1"))
    sys.exit(asyncio.run(main(p.parse_args())))
