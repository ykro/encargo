# Onboarding — Encargo

Guía para instalar, desplegar, probar y presentar Encargo. Para entender qué enseña la demo y por qué está hecha así, lee primero el [README](../README.md) y luego [DECISIONES.md](DECISIONES.md).

## Contenido

1. [Requisitos](#1-requisitos)
2. [Configuración local](#2-configuración-local)
3. [Credenciales: ADC y Secret Manager](#3-credenciales-adc-y-secret-manager)
4. [Google Cloud: los scripts de `infra/` en orden](#4-google-cloud-los-scripts-de-infra-en-orden)
5. [Local frente a nube](#5-local-frente-a-nube)
6. [Pruebas y ensayos](#6-pruebas-y-ensayos)
7. [La passkey y los navegadores habilitados](#7-la-passkey-y-los-navegadores-habilitados)
8. [Encender y apagar el modo de control](#8-encender-y-apagar-el-modo-de-control)
9. [Recorrido del código: una ejecución](#9-recorrido-del-código-una-ejecución)
10. [Solución de problemas](#10-solución-de-problemas)
11. [El día de la charla](#11-el-día-de-la-charla)

---

## 1. Requisitos

| Herramienta | Versión | Para qué |
| --- | --- | --- |
| macOS con Touch ID | — | La passkey del escenario usa el autenticador del Mac |
| Node.js + npm | Node 24 (probado con 24.21.0, npm 12) | Tiendas y app (Next.js 16.3.8, React 19.3). Las tiendas usan `node:sqlite` |
| uv | 0.8 (probado con 0.8.22) | Agente en Python. `agent/.python-version` fija Python **3.13**; uv lo instala si falta (`uv python install 3.13`) |
| Google Cloud SDK | probado con 587.0.0 | ADC, Secret Manager, Cloud Build, Cloud Run |
| Google Chrome | estable | El día de la charla, y `make e2e` y `make demo-screens` (si no está, usan el Chromium de Playwright) |
| Chromium de Playwright | 1.63 (lo fija `agent/uv.lock`) | `browse_page` y las capturas del presentador: `cd agent && uv run playwright install chromium` |
| Android SDK platform-tools (`adb`) + emulador | adb 1.0.41; emulador `Pixel_9_API_36_1` con Chrome | Solo para `make e2e-emulator` |
| `curl`, `openssl`, `make`, `bash` | los del sistema | `make reset` y `infra/20-secrets.sh` |

Acceso a Google Cloud:

- Proyecto `ai-experiments-487722`, región `us-central1`.
- Repositorio de Artifact Registry `charlas2027` (Docker, `us-central1`). Ya existe y lo comparten las demos de la charla. Si no existe:

  ```bash
  gcloud artifacts repositories create charlas2027 --repository-format=docker --location=us-central1
  ```

- Tu cuenta necesita permisos para habilitar APIs, administrar secretos, construir con Cloud Build y desplegar en Cloud Run.
- La cuenta de servicio de ejecución (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) necesita leer los secretos (eso lo da `infra/20-secrets.sh`), escribir en Firestore y llamar a Vertex AI.

## 2. Configuración local

```bash
git clone <repo> encargo && cd encargo
cp .env.example .env
for d in stores/shared stores/kilometro stores/pulso app; do (cd "$d" && npm ci); done
(cd agent && uv sync && uv run playwright install chromium)
gcloud auth application-default login
gcloud auth application-default set-quota-project ai-experiments-487722   # antes de make up: Vertex y Firestore
make up
```

- `make up` (`scripts/up.sh`) carga `.env`, instala dependencias de Node si faltan (en `stores/shared`, las tiendas y la app) y arranca cuatro procesos. Si alguno de los puertos 3000, 3001, 3002 u 8000 está ocupado, falla de inmediato y dice qué proceso lo usa.
- Los logs quedan en `.data/logs/{kilometro,pulso,agent,app}.log`.
- Ctrl-C detiene todo.

| URL | Qué es |
| --- | --- |
| `http://localhost:3000` | App Encargo: el «teléfono» (encargo y aprobación) |
| `http://localhost:3000/presentador` | Vista del presentador (1920×1080) |
| `http://localhost:3000/configurar?clave=dev-admin` | Registro de la passkey |
| `http://localhost:3000/auditoria` | Auditoría de preparación para agentes |
| `http://localhost:3001` | Kilómetro |
| `http://localhost:3002` | Pulso |
| `http://localhost:8000/health` | Agente (`{"ok":true,"mode":"gemini"\|"mock",…}`) |

Las tiendas copian el kit compartido y el catálogo en `src/shared/` antes de `dev`, `build` y `typecheck` (`npm run sync`, `stores/sync-shared.mjs`). Esas copias están en `.gitignore`. Edita siempre `stores/shared/src/` y `catalog/`, nunca la copia.

### Variables de `.env`

| Variable | Valor local | Qué controla |
| --- | --- | --- |
| `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI` | `ai-experiments-487722`, `global`, `true` | Gemini vía Vertex AI con ADC |
| `GEMINI_MODEL` | ver `.env.example` | Modelo del agente y verificador de imágenes. No está escrito en el código |
| `IMAGE_MODEL` | ver `.env.example` | Modelo de imágenes de `make images` |
| `MOCK_AI` | `0` | `1` = planificador determinista, sin modelo |
| `AGENT_PUBLIC_URL` | `http://localhost:8000` | Origen del perfil UCP del agente (`/.well-known/ucp`) |
| `STORE_URLS` | `http://localhost:3002,http://localhost:3001` | Tiendas por omisión de `POST /runs` |
| `RUN_STORE` | `memory` | `firestore` en la nube |
| `FIRESTORE_DATABASE` | `encargo` | Base de Firestore |
| `RUN_TIMEOUT_S` | `110` | Tope de una ejecución (hasta pedir la aprobación) |
| `BROWSER_ENABLED` | `1` | `0` desactiva las capturas «lo que ve una persona» |
| `SIGNER_MODE` | `test` | `passkey` en la nube: solo una aserción WebAuthn aprueba |
| `PASSKEY_RP_ID`, `PASSKEY_ORIGIN` | `localhost`, `http://localhost:3000` | A qué host y origen se ligan las passkeys |
| `HUMAN_APPROVAL_TOKEN` | `change-me-human` | Firmador de prueba, solo con `SIGNER_MODE=test` |
| `PLATFORM_SIGNING_JWK` | vacío | Llave estable del mandato AP2. Vacía = una llave nueva por proceso |
| `AGENT_URL`, `PULSO_URL`, `KILOMETRO_URL` | localhost | Dónde la app encuentra al agente y las tiendas |
| `ADMIN_TOKEN` | `dev-admin` | Reinicio, modo de control y registro de passkeys (en la nube lo usa el agente por el presentador) |
| `PULSO_AGENT_READY` | `false` | Modo de control al arrancar |
| `TRUSTED_PLATFORM_PROFILES` | `http://localhost:8000/.well-known/ucp` | Plataformas cuyos mandatos aceptan las tiendas |
| `MERCHANT_SIGNING_JWK` | vacío | Llave estable de la tienda. Vacía = una llave nueva por proceso |
| `MODEL_HEDGE_AFTER_S` | `6` | Segundos antes de enviar una llamada de cobertura al modelo |
| `MODEL_MAX_PARALLEL` | `5` | Llamadas idénticas al modelo en vuelo como máximo por turno (gana la primera) |
| `STAGE_TOKEN` | vacío (no se usa con `SIGNER_MODE=test`) | Token de escenario: habilita un navegador para enviar encargos, cancelar pagos, reiniciar y cambiar el modo de control. Lo entregan «Habilitar con Touch ID» o `/configurar?clave=…` |
| `APP_PUBLIC_HOST` | `localhost:3000` | Host que muestra el presentador y que codifica el QR de `/auditoria` |

## 3. Credenciales: ADC y Secret Manager

**ADC.** Gemini (Vertex AI) y Firestore usan Application Default Credentials, sin llaves en archivos:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project ai-experiments-487722
```

En Cloud Run, las mismas bibliotecas usan la cuenta de servicio de ejecución. Con `MOCK_AI=1` y `RUN_STORE=memory` no hace falta ADC para correr en local; `make test` nunca lo necesita.

**Secret Manager.** `infra/20-secrets.sh` crea cuatro secretos una sola vez (si ya existen, no los toca) y le da a la cuenta de ejecución `roles/secretmanager.secretAccessor`:

| Secreto | Contenido | Lo usa |
| --- | --- | --- |
| `encargo-platform-jwk` | Llave privada EC P-256 (JWK) con la que el agente firma los mandatos AP2 | Agente (`PLATFORM_SIGNING_JWK`) |
| `encargo-admin-token` | Código de configuración y de administración | Tiendas y agente (`ADMIN_TOKEN`): el agente lo usa para «Empezar de nuevo» y el modo de control; `make reset`, `bias-test`, `e2e` y `demo-screens` con `TARGET=cloud`; `/configurar` |
| `encargo-stage-token` | Token de escenario: habilita un dispositivo para enviar encargos y cancelar pagos | Agente (`STAGE_TOKEN`). El navegador lo recibe con «Habilitar con Touch ID» (o `/configurar?clave=…`) y lo guarda en `localStorage` |
| `encargo-human-token` | Token del firmador de prueba | Agente (`HUMAN_APPROVAL_TOKEN`). En la nube no aprueba nada, porque el agente corre con `SIGNER_MODE=passkey` |

Leer un secreto:

```bash
gcloud secrets versions access latest --secret=encargo-admin-token --project ai-experiments-487722
```

- Para rotar un secreto, agrega una versión (`gcloud secrets versions add encargo-admin-token --data-file=-`) y vuelve a desplegar los servicios que lo usan.
- Cloud Run lee `:latest` cuando crea la revisión.
- Ningún secreto se escribe en el repositorio. `.env` está en `.gitignore`.

## 4. Google Cloud: los scripts de `infra/` en orden

Todos los scripts cargan `infra/env.sh`:

- `PROJECT_ID=ai-experiments-487722`, `REGION=us-central1` y `AR_REPO=charlas2027`.
- `CLOUDSDK_CORE_PROJECT`, para no tocar tu configuración global de gcloud.
- `APP=encargo`, desde `infra/app.env`.

Cada script es idempotente.

`infra/urls.sh` calcula las URL deterministas de Cloud Run (`https://SERVICIO-NUMERO_DE_PROYECTO.us-central1.run.app`). Así, cada servicio conoce a los demás antes de que existan, y el orden de despliegue no rompe referencias.

| Paso | Script | Qué hace |
| --- | --- | --- |
| 1 | `infra/10-enable-apis.sh` | Habilita Run, Cloud Build, Artifact Registry, Firestore, Vertex AI y Secret Manager. Crea el repositorio de Artifact Registry `charlas2027` y la base de Firestore `encargo` (`nam5`) si no existen, y da a la cuenta de servicio de cómputo los roles `roles/datastore.user` y `roles/aiplatform.user`. Se puede volver a ejecutar sin riesgo. |
| 2 | `infra/20-secrets.sh` | Genera la llave de la plataforma con el propio código del agente (`encargo.ap2.signer.platform_key`). Crea los cuatro secretos y da acceso a la cuenta de ejecución. |
| 3 | `infra/30-deploy-stores.sh` | Para Pulso y Kilómetro: `npm run sync`, Cloud Build → Artifact Registry → Cloud Run. Usa como máximo 1 instancia (mínimo `MIN_INSTANCES`, 0 por omisión), 512 MiB, `PULSO_AGENT_READY` (por omisión `false`), `TRUSTED_PLATFORM_PROFILES=<agente>/.well-known/ucp` y `ADMIN_TOKEN` desde Secret Manager. |
| 4 | `infra/40-deploy-agent.sh` | Agente con CPU siempre activa, 2 vCPU, 2 GiB, timeout de 3600 s y como máximo 1 instancia (mínimo 0 por omisión). Toma `GEMINI_MODEL` de `.env`. Fija `RUN_STORE=firestore`, `SIGNER_MODE=passkey` y `PASSKEY_RP_ID`/`PASSKEY_ORIGIN` = el host y el origen de la app. Monta los cuatro secretos. |
| 5 | `infra/50-deploy-app.sh` | App con 0 a 2 instancias y 512 MiB. Le pasa las URL del agente y las tiendas y `APP_PUBLIC_HOST`. Al final imprime la URL de configuración de la passkey. |

Los cuatro servicios quedan con 0 instancias mínimas: nada se cobra las 24 horas, y la página del presentador los despierta al abrirse (sección 11).

`make deploy` ejecuta los cinco en orden. Para volver a desplegar un solo servicio, ejecuta su script:

```bash
./infra/40-deploy-agent.sh                              # solo el agente
PULSO_AGENT_READY=true ./infra/30-deploy-stores.sh      # tiendas con el modo de control encendido al arrancar
```

Comprobación rápida después de desplegar:

```bash
source infra/env.sh && source infra/urls.sh
curl -s "$AGENT_URL/health"                         # {"ok":true,"mode":"gemini","run_store":"firestore"}
curl -s -o /dev/null -w '%{http_code}\n' "$PULSO_URL/.well-known/ucp"       # 404 (Pulso opaco)
curl -s -o /dev/null -w '%{http_code}\n' "$KILOMETRO_URL/.well-known/ucp"   # 200
make audit URL=$KILOMETRO_URL                        # Puntaje: 8/8
```

## 5. Local frente a nube

| Aspecto | Local (`make up`) | Nube (`make deploy`) |
| --- | --- | --- |
| Estado de las ejecuciones | `RUN_STORE=memory`: se pierde al detener el agente, **incluidas las passkeys** | Firestore `encargo`: sobrevive a reinicios; un reinicio conserva las passkeys |
| Quién aprueba un pago | `SIGNER_MODE=test`: passkey o el token de prueba | `SIGNER_MODE=passkey`: solo una passkey |
| RP ID de la passkey | `localhost` (WebAuthn permite `http://localhost`) | El host `encargo-app-611681112050.us-central1.run.app` |
| Modelo | Gemini con ADC, o `MOCK_AI=1` | Gemini (`MOCK_AI=0`) |
| Llaves AP2 | Nuevas en cada proceso | La de la plataforma viene de Secret Manager; la de cada tienda se genera por proceso (una sola instancia) |
| Comandos | `make reset`, `make e2e`, … | Los mismos con `TARGET=cloud` (leen las URL de `infra/urls.sh` y `ADMIN_TOKEN` de Secret Manager) |

`TARGET=cloud` aplica a `reset`, `bias-test`, `e2e` y `e2e-emulator` (`e2e-emulator` usa la nube por defecto; `demo-screens`, `record-replay` y `plan-b-video` siempre van contra la nube). `e2e` y `e2e-emulator` también aceptan `APP_URL=https://…` y `AGENT_URL=https://…` para apuntar a otra instancia. `make audit` recibe la URL directamente.

## 6. Pruebas y ensayos

### `make test` — sin red, en segundos

```bash
make test
```

El mismo `make test` corre en GitHub Actions en cada push y pull request (`.github/workflows/test.yml`), sin nube ni Gemini.

Corre cuatro grupos de pruebas:

1. **Kit de comercio** (`stores/shared/tests/`, vitest, 19 pruebas): lo que publican schema.org, el feed y UCP; las fechas de entrega; y que no hay pago sin mandato. Esto último cubre un mandato ausente, una llave desconocida, una plataforma sin confianza, términos distintos, otro checkout, un mandato vencido y un mandato para otra tienda. También: dos `/complete` simultáneos dejan un solo pedido, un mandato rechazado devuelve el checkout, solo la llave del checkout (o la del administrador) lo cancela, y la llave de administración falla cerrada en producción.
2. **Typecheck** de Kilómetro, Pulso y la app.
3. **Agente** (`agent/tests/`, pytest, 53 pruebas). `conftest.py` fija `MOCK_AI=1`, `RUN_STORE=memory`, `BROWSER_ENABLED=0` y `SIGNER_MODE=test`. Las tiendas falsas (`tests/fake_stores.py`) sirven fixtures reales de Kilómetro y Pulso. Las pruebas que más enseñan:
   - `test_pulso_page_has_no_facts_for_a_machine`.
   - `test_control_mode_buys_where_it_is_cheaper`.
   - `test_guardrail_refuses_approval_when_a_condition_is_not_verified`.
   - `test_agent_has_no_tool_that_signs_or_pays`.
   - `test_wrong_origin_unregistered_key_or_replay_never_pays`.
   - `test_friday_is_the_first_friday_after_the_run_date`.
   - `test_no_approval_for_a_checkout_that_is_not_the_errand` (dos pares, otra talla, 150 USD o más, entrega tardía) y `test_an_errand_missing_a_condition_can_never_be_bought`.
   - `test_two_concurrent_signatures_complete_one_order` y `test_non_json_store_error_fails_the_run_visibly`.
   - `test_runs_need_the_stage_token_and_ignore_client_stores`, `test_latest_run_hides_the_mandate_from_anonymous_callers`, `test_admin_fails_closed_without_a_token`, `test_audit_refuses_non_public_hosts`.

### `make e2e` — passkey real en Chrome

```bash
make e2e                # contra make up (en otra terminal)
make e2e TARGET=cloud   # contra Cloud Run
```

`scripts/e2e_passkey.py` abre Chrome de 390×844 con el autenticador virtual de DevTools (una passkey de plataforma con verificación de usuario). Luego:

1. Registra la passkey en `/configurar` con el código de configuración.
2. Envía el encargo.
3. Espera «Autoriza la compra».
4. Firma el mandato y espera el pedido confirmado.

Imprime una línea `✓` por paso y sale con un código distinto de cero si algo falla. Al terminar borra la credencial virtual del agente. Usa `--headed` (corriendo el script a mano) para ver la ventana.

### `make e2e-emulator` — el teléfono en el emulador Android

El script abre primero `/configurar?clave=…` en el emulador para habilitar ese navegador con el token de escenario.

```bash
emulator -avd Pixel_9_API_36_1 &        # usa el primer emulador de adb devices (o exporta ANDROID_SERIAL)
make e2e-emulator                       # Cloud Run por defecto
make e2e-emulator TARGET=local          # contra make up: adb reverse tcp:3000 tcp:3000 automático
```

`scripts/e2e_emulator.py` abre Chrome en el emulador por `adb` y lo controla por DevTools (`adb forward tcp:9333`). Luego:

1. Envía el encargo y sigue la ejecución.
2. Espera la tarjeta de aprobación e informa si el botón «Firmar mandato con passkey» está habilitado.
3. **Cancela**: no se cobra nada.

El Makefile pasa `--try-passkey`, así que también abre `/configurar` y captura la hoja nativa de Chrome («Create passkey on another device?»). Esa hoja es la razón por la que en el escenario firma el portátil. Las capturas quedan en `docs/screenshots/emulator/`.

Por defecto va contra Cloud Run: desde el emulador, `localhost` es el propio emulador. Con `TARGET=local` el Makefile ejecuta `adb reverse tcp:3000 tcp:3000` sobre ese emulador para que el `localhost:3000` del emulador llegue a la app de `make up`.

### `make bias-test` — sin sesgo y en menos de 2 minutos

```bash
make bias-test TARGET=cloud              # 10 + 10 ejecuciones, ~10–15 min
make bias-test TARGET=cloud RUNS=2       # ensayo corto
```

`agent/encargo/bias_test.py` hace lo siguiente:

1. Registra una passkey de software con el código de configuración.
2. Para cada modo (apagado y encendido), cambia el modo de control de Pulso. En cada ejecución reinicia las dos tiendas, alterna el orden de las tiendas, envía el encargo, firma con la passkey y espera el pedido.
3. Imprime una línea por ejecución y un resumen por modo.
4. Deja el modo de control apagado y borra la passkey.

Pasa si cada modo acierta en al menos el 90 % de las ejecuciones y ninguna llega a 120 s. El JSON queda en `bias-results/<target>-<fecha>.json`.

Para un solo modo, ejecútalo a mano:

```bash
cd agent && uv run python -m encargo.bias_test --runs 3 --modes on
```

### Otros comandos

- `make audit URL=$PULSO_URL` — el checklist de la charla; sirve con la URL de cualquier tienda. Agrega `--json` ejecutando `cd agent && uv run python -m encargo.audit URL --json`.
- `make reset` — en menos de 10 s (cada `curl` tiene un tope de 8 s y corren en paralelo). En el escenario hace lo mismo «Empezar de nuevo».

### Ensayar sin red

Pon `MOCK_AI=1` en `.env` y ejecuta `make up`. El planificador determinista (`agent/encargo/mock_planner.py`) recorre las mismas herramientas contra las tiendas locales: lee el feed, el perfil UCP o la página, llena el checklist, arma el checkout y pide la aprobación. El checklist, el guardarraíl y el flujo del mandato son los reales.

## 7. La passkey y los navegadores habilitados

La passkey es la única forma de aprobar un pago en la nube. Ya hay una registrada para el portátil del escenario (`adrian-macbook`, Touch ID); sobrevive a cualquier reinicio, y el presentador avisa si no hubiera ninguna («No hay una passkey registrada para firmar»).

**Habilitar un navegador** (enviar encargos, cancelar, «Empezar de nuevo» y el interruptor del modo de control): en la página del teléfono, «Habilitar con Touch ID». La app pide una firma a la passkey registrada y, si es válida, el agente entrega el token de escenario, que queda en ese perfil de Chrome (`localStorage`). El presentador y el teléfono son del mismo perfil, así que basta hacerlo una vez en cualquiera de los dos. No hay código que escribir.

**Registrar una passkey nueva** (otro portátil, o si se borró): una sola vez, con el código de configuración:

```bash
source infra/env.sh && source infra/urls.sh
CLAVE=$(gcloud secrets versions access latest --secret=encargo-admin-token)
open "$APP_URL/configurar?clave=$CLAVE"
```

1. En «Configura tu passkey», revisa el nombre del dispositivo y pulsa «Registrar passkey en este dispositivo».
2. Confirma con Touch ID.
3. La página debe decir «Listo: «…» ya puede firmar pagos» y «Este dispositivo puede enviar encargos y cancelar pagos».

Al abrir el enlace, la app canjea la clave por el token de escenario y la borra de la barra de direcciones (`history.replaceState`).

Abre siempre la app con la URL determinista (`…-611681112050.us-central1.run.app`). Con el alias `…-uc.a.run.app` el origen no coincide con `PASSKEY_ORIGIN` y la verificación falla.

**En local:** abre `http://localhost:3000/configurar?clave=dev-admin`. Con `RUN_STORE=memory` la passkey se pierde al reiniciar el agente; vuelve a registrarla después de cada `make up`.

**Comprobar:**

```bash
source infra/env.sh && source infra/urls.sh             # define $AGENT_URL, $APP_URL, $PULSO_URL, $KILOMETRO_URL
ADMIN_TOKEN=$(gcloud secrets versions access latest --secret=encargo-admin-token)
curl -s $AGENT_URL/passkeys/status                       # anónimo: {"registered":N,"rp_id":"…"}
curl -s -H "authorization: Bearer $ADMIN_TOKEN" $AGENT_URL/passkeys/status   # {"registered":N,"rp_id":"…","passkeys":[{"id","label","created_at","last_used_at"}]}
```

**Borrar una passkey:** en `/configurar` (con el código de configuración escrito) cada dispositivo registrado tiene un botón «Eliminar». Por API: `DELETE /passkeys/{id}` con `authorization: Bearer <ADMIN_TOKEN>`; los id salen en `/passkeys/status`. `make e2e`, `make demo-screens`, `make record-replay` y `make bias-test` borran solas las credenciales que crean.

## 8. Encender y apagar el modo de control

Con el modo de control encendido, Pulso publica la misma capa para máquinas que Kilómetro (feed, sitemap, perfil UCP, API de checkout y JSON-LD en la página de producto), y Encargo debe comprar en Pulso porque es más barata.

**En el escenario:** el interruptor «Modo de control» del encabezado del presentador. Un clic lo enciende y otro lo apaga; solo responde en un navegador habilitado (sección 7). El presentador llama a `POST /stage/control` del agente, que tiene el `ADMIN_TOKEN` y cambia a Pulso; el navegador nunca ve ese token. «Empezar de nuevo» también lo apaga, y lo mismo pasa sola la página del presentador cuando se abre después de más de 10 minutos sin encargos.

**En desarrollo:**

```bash
curl -s $PULSO_URL/api/admin/agent-ready   # {"store":"pulso","agent_ready":false}
# nube: source infra/env.sh && source infra/urls.sh && ADMIN_TOKEN=$(gcloud secrets versions access latest --secret=encargo-admin-token)
# local: PULSO_URL=http://localhost:3002 ADMIN_TOKEN=dev-admin
curl -s -XPOST -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"enabled":true}' "$PULSO_URL/api/admin/agent-ready"     # encender (false: apagar)
```

- `make reset` también lo apaga.
- El cambio vive en la memoria del proceso de Pulso, que corre como una sola instancia. Si la instancia se reinicia (o Cloud Run la apaga por inactividad), vuelve al valor de `PULSO_AGENT_READY`, que por omisión es apagado.
- Para que arranque encendido: `PULSO_AGENT_READY=true` en `.env` (local) o `PULSO_AGENT_READY=true ./infra/30-deploy-stores.sh` (nube).
- La auditoría de `/auditoria` y `make audit` reflejan el cambio al instante.

## 9. Recorrido del código: una ejecución

Lo que pasa desde que la persona escribe el encargo hasta el pedido. Los eventos entre paréntesis son los que dibujan el teléfono y el presentador.

### 1. El encargo

- `app/src/components/ErrandForm.tsx` hace `POST /api/agent/runs` con `{errand, stores}`: solo el texto y las URL de Pulso y Kilómetro.
- El proxy `app/src/app/api/agent/[...path]/route.ts` lo reenvía al agente.
- La app navega a `/encargo/<id>`, que se suscribe a `GET /runs/<id>/events` (SSE) con `app/src/lib/useRun.ts`.

### 2. La ejecución empieza

- `agent/encargo/api.py` `create_run` → `runner.start_run`.
- `errand.parse_errand` convierte el texto en cuatro condiciones con id estable: `categoria`, `talla`, `precio` y `entrega` (el viernes calculado desde hoy).
- Guarda la ejecución en el `RunStore` y lanza `execute_run` en segundo plano. `POST /runs` responde de inmediato.

### 3. El agente trabaja

- `execute_run` crea un `RunContext` y emite `run_started`.
- En paralelo, `_human_views` toma con Playwright una captura de la portada de cada tienda (`human_view`).
- `_run_adk` le da a ADK un prompt con el encargo, la fecha de hoy, las condiciones con su id y las tiendas.
- El `Agent` de `agent/encargo/agent.py` usa `HedgedGemini` (`model.py`). Cada llamada a una herramienta se emite como `step`, cada resultado como `observation` y cada frase del modelo como `thought`.

### 4. Leer las tiendas

`tools/discovery.inspect_store` pide `/.well-known/ucp`, `/robots.txt`, `/feed.xml`, `/sitemap.xml` y la portada, y muestrea una página de producto buscando JSON-LD (`agent_view` tipo `sources`).

- **Kilómetro:** responde con todo. `tools/product_feed.read_product_feed` o `tools/ucp_client.search_catalog` normalizan cada producto con `tools/offer_facts.offer`. Esa función también calcula `arrives_by` con días hábiles (`agent_view` tipo `offers`).
- **Pulso:** responde 404 en las rutas para máquinas. El agente prueba `tools/browser.browse_page`: Chromium renderiza la página, la captura va al presentador y al agente le llega un DOM sin precio ni tallas, con un `canvas` (`agent_view` tipo `page`).

### 5. El checklist

- `tools/checklist.record_checklist` (una llamada por tienda) registra cada condición como `met`, `not_met` o `not_verifiable`, con una frase de evidencia (`checklist`).
- Kilómetro queda en 4 × «cumple».
- Pulso queda en «no verificable».

### 6. El checkout

`tools/ucp_client.create_checkout` hace `POST {endpoint}/checkout-sessions` en Kilómetro, con el `variant_id` de la talla 9 y el encabezado `UCP-Agent`.

- La tienda (`stores/shared/src/ucp/checkoutApi.ts`) arma el checkout, con la fecha de entrega en `fulfillment`, y lo firma (`ap2.merchant_authorization`).
- El agente verifica esa firma con la llave del perfil de la tienda (`ap2/merchant_signature.py`) antes de seguir (`checkout_created`).

### 7. El guardarraíl y la solicitud de aprobación

- `tools/approval.request_payment_approval` comprueba `ctx.all_met(store)`.
- Guarda un mandato `pending_signature`, pone la ejecución en `awaiting_approval` y emite `approval_requested`, con artículos, total, entrega y la razón.
- El modelo recibe la orden de detenerse. Al terminar ADK, `execute_run` emite `decision`.

### 8. La persona firma

`app/src/components/RunPhone.tsx` muestra «Autoriza la compra». Al pulsar «Firmar mandato con passkey»:

1. `POST /mandates/<id>/passkey-options` → `passkey.signing_options`. Calcula `checkout_hash = base64url(sha256(checkout_jwt))` y el desafío `sha256(checkout_hash + "." + nonce)`, y guarda el flujo.
2. `startAuthentication` (`@simplewebauthn/browser`) → Touch ID.
3. `POST /mandates/<id>/sign` con `{flow_id, credential}` → `passkey.verify_signature`, que:
   - consume el desafío (no se puede reutilizar);
   - recalcula el hash, por si el carrito cambió;
   - verifica la aserción con la llave pública registrada, el RP ID, el origen, la verificación de usuario y el contador de firmas.

### 9. El mandato y la compra

`purchase.sign_and_complete` hace lo siguiente:

1. Construye el mandato AP2 (`ap2/signer.build_checkout_mandate`): un SD-JWT ES256 con `iss` = el perfil del agente, `aud` = la tienda, expiración de 15 min, `nonce` = el id del checkout, y las divulgaciones `vct` + `checkout_hash` + `checkout_jwt`. Emite `mandate_signed`.
2. Llama a `POST /checkout-sessions/<id>/complete` con el instrumento sandbox y `ap2.checkout_mandate`.

### 10. La tienda verifica

`completeCheckout` hace lo siguiente:

1. `platformKeysFor` comprueba que el perfil del encabezado `UCP-Agent` esté en `TRUSTED_PLATFORM_PROFILES` y descarga sus llaves.
2. `verifyCheckoutMandate` verifica la firma, la expiración, el `aud`, la cadena de divulgaciones, el `checkout_hash` y que los términos aprobados sean exactamente los que firmó la tienda (JCS).
3. Revisa el instrumento sandbox y descuenta el stock.
4. Crea el pedido.

### 11. Confirmación

- El agente guarda el pedido y emite `order_confirmed` y `run_finished` con el tiempo total.
- El teléfono muestra «Pedido confirmado» y el presentador cierra la ejecución.

Si la persona pulsa «Cancelar», `POST /mandates/<id>/reject` emite `approval_rejected`: rechazar nunca mueve dinero, así que no requiere passkey.

## 10. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| La ejecución falla con `GEMINI_MODEL no está definido` | Falta `.env` o la variable | `cp .env.example .env`, o `MOCK_AI=1` |
| Errores de permisos con Vertex AI o Firestore en local | No hay ADC o falta el proyecto de cuota | `gcloud auth application-default login` y `set-quota-project ai-experiments-487722` |
| `Executable doesn't exist` (Playwright) | Falta Chromium | `cd agent && uv run playwright install chromium` |
| «Se agotó el tiempo del encargo» | El modelo tardó más que `RUN_TIMEOUT_S` | Revisa los logs (`gcloud run services logs read encargo-agent --region us-central1`); busca `sending hedge`. Vuelve a intentar |
| El botón «Firmar mandato con passkey» está deshabilitado | No hay passkey para ese RP ID | Regístrala (sección 7); el presentador también lo avisa |
| «Esta passkey no está registrada» o falla la firma | La passkey es de otro entorno (local o nube), el agente local se reinició (memoria) o se abrió la app con el alias `…-uc.a.run.app` | Usa la URL determinista y vuelve a registrar |
| «El código de configuración no es válido» | `clave` distinta de `ADMIN_TOKEN` | Copia el valor de `encargo-admin-token` (nube) o `dev-admin` (local) |
| `401 Solo la persona puede aprobar este pago` | Se intentó firmar sin passkey con `SIGNER_MODE=passkey` | Firma desde la app |
| La tienda responde «La plataforma que firma este mandato no es de confianza» | `TRUSTED_PLATFORM_PROFILES` ≠ `AGENT_PUBLIC_URL/.well-known/ucp` | Ajusta `.env`, o vuelve a desplegar las tiendas con `infra/30` |
| «El mandato está firmado con una llave desconocida» | El agente local generó una llave nueva al reiniciar y la tienda tiene la anterior en caché (60 s) | `make reset` (vacía la caché) o espera un minuto; en la nube la llave es fija |
| `out_of_stock` o el stock se acabó tras muchos ensayos | El estado de SQLite persiste | «Empezar de nuevo» en el presentador (en local, `make reset`) |
| El presentador muestra una ejecución vieja | Sigue `/runs/latest` | «Empezar de nuevo» |
| Pulso aparece legible sin querer | El modo de control quedó encendido | El interruptor «Modo de control» o «Empezar de nuevo» |
| `make reset` termina con `reset FALLÓ: …` | Ese servicio no respondió (apagado, URL o `ADMIN_TOKEN` incorrectos) | Revisa el servicio nombrado con `/health` o los `curl` de la sección 8 y repite |
| `make e2e-emulator` no conecta | Emulador apagado, otro serial o Chrome sin abrir | `adb devices`; `ANDROID_SERIAL=…`; abre Chrome una vez en el emulador |
| El despliegue falla en `gcloud builds submit` | Falta el repositorio `charlas2027` o faltan permisos | Ver sección 1 |
| Puertos 3000–3002 u 8000 ocupados | Quedó un `make up` anterior | `lsof -i :3000` y detén el proceso |

## 11. El día de la charla

El guion, con capturas y qué decir en cada pantalla, está en [DEMO.md](DEMO.md). Ese día no se corre ningún comando.

### Qué pasa cuando abres el presentador

`/presentador` llama a `POST /stage/warmup` del agente (`agent/encargo/stage.py`) y luego consulta `GET /stage/status` cada 3 s hasta que todo está listo:

- despierta las dos tiendas (portada, feed y perfil UCP) y el agente;
- hace una llamada corta a Gemini y arranca Chromium (como mucho cada 5 minutos);
- si pasaron más de 10 minutos desde el último encargo y no hay uno en curso, empieza de cero: stock completo, sin pedidos ni encargo en pantalla, modo de control apagado;
- revisa que haya una passkey registrada y stock de la talla 9.

Mientras tanto la columna central dice «Preparando la demo…» con cada parte; cuando todo responde dice «Envía un encargo desde la app». Con los servicios en 0 instancias, eso tarda unos 15–20 s. Mientras la página siga abierta, cada 4 minutos vuelve a despertar los servicios para que Cloud Run no los apague.

En el presentador:

- **«Modo de control»** (encabezado): enciende o apaga el modo de control.
- **«Empezar de nuevo»** (abajo a la derecha): stock completo, sin pedidos, modo de control apagado.
- **«Ver la ejecución grabada»** (abajo a la derecha, en ámbar si la ejecución pasa de 60 s o se detiene): el plan B. El teléfono pasa solo a la misma grabación y su passkey la continúa. La franja dice «REPETICIÓN GRABADA», el día en que se grabó y «no es en vivo». Si el teléfono no está abierto, «Continuar con firma simulada» la continúa y la pantalla lo dice. «Volver a lo en vivo» regresa los dos.

### Si cambiaste algo (mantenimiento, no el día de la charla)

- [ ] `make test` pasa.
- [ ] `make deploy` (o el script del servicio que cambió).
- [ ] Si cambiaste el catálogo o el encargo: `make record-replay`, `./infra/50-deploy-app.sh` y `make plan-b-video VIDEO=1`. `make test` falla si una grabación ya no coincide.
- [ ] `make demo-screens`: la demo completa con clics, como el día de la charla.
- [ ] `make bias-test TARGET=cloud` (o `RUNS=3`).
