# Encargo — la carrera de los tenis

Demo de la charla **«Tu próximo cliente es un agente de IA»**.

Encargo es un agente que compra por una persona. En el escenario recibe un solo encargo:

> «Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes.»

También recibe dos tiendas ficticias que venden los mismos tenis:

- **Pulso** es espectacular y más barata (139 USD), pero solo la puede leer una persona. El nombre y el precio están pintados dentro de las fotos. Las tallas están dibujadas en un `canvas`. La fecha de entrega aparece solo al final del pago, después de iniciar sesión.
- **Kilómetro** es sobria y más cara (145 USD), pero está lista para agentes. Publica schema.org, un feed de Merchant Center y un perfil UCP, y su checkout exige un mandato AP2 firmado por la persona.

Encargo compra en Kilómetro porque es la única tienda donde puede verificar cada condición. Con el modo de control encendido (`PULSO_AGENT_READY=true`), Pulso publica los mismos datos y Encargo compra en Pulso, porque es más barata. El agente no prefiere ninguna tienda: solo usa lo que puede comprobar.

![Arquitectura de Encargo](docs/diagrams/architecture.png)

## Qué vas a aprender

### 1. Los agentes leen datos, no marketing

Kilómetro publica cada dato del encargo en tres formatos que una máquina lee sin adivinar:

- JSON-LD de schema.org en cada página de producto (`ProductGroup`, una variante por talla con `Offer.availability` y `OfferShippingDetails` con días de preparación y tránsito): `stores/shared/src/schemaOrg.ts`.
- Un feed RSS de Merchant Center en `/feed.xml`, un `item` por talla: `stores/shared/src/merchantFeed.ts`.
- Un perfil UCP en `/.well-known/ucp` con catálogo, carrito y checkout: `stores/shared/src/ucp/profile.ts`.

Pulso tiene los mismos productos, pero sus datos no están en ningún formato legible:

- `stores/pulso/scripts/build-vitrina.mjs` arma el catálogo del navegador solo con una referencia opaca, una foto y las tallas. No incluye nombre ni precio.
- Las fotos con nombre y precio pintados están en `catalog/images/pulso/`.
- El selector de tallas se dibuja en un `canvas` (`stores/pulso/src/components/SizePicker.tsx`), así que el DOM no tiene tallas ni disponibilidad.
- La fecha de entrega aparece solo en el paso final, después de iniciar sesión (`stores/pulso/src/app/checkout/page.tsx`).

Del lado del agente, `agent/encargo/tools/browser.py` toma la captura de pantalla para la persona, pero al agente solo le devuelve lo que la página dice como datos o texto. Los píxeles no son evidencia. La instrucción del agente (`agent/encargo/agent.py`) lo repite: un dato que solo aparece dentro de una imagen no cuenta.

La vista del presentador muestra esta diferencia en dos columnas: «Lo que ve una persona» (capturas reales de las dos tiendas) y «Lo que ve el agente» (los campos que pudo extraer). Pruebas: `agent/tests/test_what_the_agent_sees.py`.

![Qué puede leer el agente en cada tienda](docs/diagrams/agent-readability-matrix.png)

### 2. El embudo colapsa

El agente nunca entra por la página de inicio. `inspect_store` (`agent/encargo/tools/discovery.py`) empieza por los lugares conocidos: `/.well-known/ucp`, `/robots.txt`, `/feed.xml` y `/sitemap.xml`. Con eso pasa directo a feed → perfil → checkout → mandato. No hay banner, recomendación ni página de categoría que lo distraiga.

Las herramientas del agente son exactamente ese embudo corto: `inspect_store`, `read_product_feed`, `search_catalog`, `fetch_page`, `browse_page`, `record_check`, `create_checkout` y `request_payment_approval` (`agent/encargo/agent.py`). En Cloud Run, una corrida completa, del encargo al pedido confirmado, tarda unos 30 segundos de promedio (ver [resultados](#resultados-de-la-prueba-de-sesgo)).

### 3. El modo de control demuestra que el agente no tiene sesgo

- `PULSO_AGENT_READY` (`stores/shared/src/store.ts`) enciende en Pulso la misma capa para máquinas que tiene Kilómetro. `agentReadyOnly` (`stores/shared/src/ucp/http.ts`) abre o cierra el feed, el sitemap, el perfil UCP y los endpoints de UCP. La página de producto (`stores/pulso/src/app/p/[slug]/page.tsx`) agrega el mismo JSON-LD.
- El agente no recibe ninguna pista: `POST /runs` solo lleva el encargo. Las tiendas las fija el servidor (`STORE_URLS`) y las baraja en cada corrida, así que la posición en la lista no puede decidir (`agent/encargo/api.py`). La instrucción dice «trata a todas las tiendas exactamente igual».
- `make bias-test` hace 10 corridas con el modo apagado y 10 con el modo encendido, y registra el orden que vio cada corrida (`agent/encargo/bias_test.py`). Prueba rápida sin red: `test_control_mode_buys_where_it_is_cheaper`.

### 4. Confianza: un mandato AP2 firmado con passkey

El agente puede armar el carrito, pero no puede pagar:

- `request_payment_approval` (`agent/encargo/tools/approval.py`) solo pide la aprobación si las **cuatro** condiciones de esa tienda están en «cumple» (un encargo sin las cuatro nunca se compra). Además revisa, sin el modelo, el checkout que firmó la tienda (`agent/encargo/checkout_rules.py`): exactamente un par, la talla pedida, total menor al tope en USD y entrega a más tardar en la fecha límite.
- La tienda firma cada checkout (`merchant_authorization`, `stores/shared/src/ap2/merchantAuthorization.ts`). El agente verifica esa firma con la llave del perfil UCP de la tienda antes de mostrarle los términos a la persona (`agent/encargo/ap2/merchant_signature.py`).
- La persona firma con su passkey un desafío derivado de ese checkout: `sha256(checkout_hash + "." + nonce)` (`agent/encargo/passkey.py`). Por eso la firma aprueba ese carrito y ningún otro.
- Solo después de esa firma la plataforma emite el mandato AP2 (`agent/encargo/ap2/signer.py`) y completa la compra (`agent/encargo/purchase.py`). A ese módulo solo se llega desde el endpoint humano; ninguna herramienta del agente lo alcanza.
- La tienda rechaza `complete` si no recibe un mandato válido, si lo firmó una plataforma en la que no confía o si aprueba otros términos (`stores/shared/src/ap2/checkoutMandate.ts`, `platformKeys.ts`).

Pruebas: `agent/tests/test_no_payment_without_mandate.py`, `agent/tests/test_passkey_approval.py` y `stores/shared/tests/noPaymentWithoutMandate.test.ts`.

![Secuencia de una compra](docs/diagrams/purchase-sequence.png)

### 5. El checklist práctico: `make audit`

`make audit URL=https://tu-tienda.example` (`agent/encargo/audit.py`) revisa cualquier tienda con solo peticiones GET. No crea carritos ni checkouts. Califica ocho puntos:

1. Datos estructurados schema.org (Product + Offer).
2. Disponibilidad por talla o variante.
3. Tiempo de entrega legible por máquinas.
4. Feed de productos.
5. Perfil UCP.
6. API de checkout.
7. Autorización de pago AP2.
8. Contenido visible sin JavaScript.

Cada punto que falla dice qué hacer. La misma auditoría está en la app, en `/auditoria`. Resultado en Cloud Run: Kilómetro 8/8, Pulso 0/8.

## Arquitectura

| Componente | Código | Stack | Servicio de Cloud Run |
| --- | --- | --- | --- |
| Pulso | `stores/pulso/` | Next.js, todo se dibuja en el navegador, SQLite en el proceso | `encargo-pulso` |
| Kilómetro | `stores/kilometro/` | Next.js con render en el servidor, API UCP, SQLite en el proceso | `encargo-kilometro` |
| Kit de comercio compartido | `stores/shared/` | schema.org, feed, UCP y verificación AP2 (TypeScript). Se copia dentro de cada tienda | — |
| Agente Encargo | `agent/` | Python 3.13, ADK, Gemini (`GEMINI_MODEL`) vía Vertex AI, Playwright (Chromium headless), FastAPI | `encargo-agent` |
| App Encargo | `app/` | Next.js. El encargo y la aprobación con passkey en el «teléfono» (`/`, `/encargo/[id]`), el presentador (`/presenter`), la configuración de la passkey (`/configurar`) y la auditoría (`/auditoria`) | `encargo-app` |
| Estado de las corridas | — | Firestore, base `encargo` | — |

La app nunca llama al agente desde el navegador. Usa un proxy en el mismo origen (`app/src/app/api/agent/[...path]/route.ts`), incluido el stream SSE, para que las passkeys tengan un solo origen y no haya CORS. El agente transmite cada paso como eventos (`step`, `observation`, `agent_view`, `checklist`, `approval_requested`, `order_confirmed`, …). El teléfono y el presentador dibujan esos mismos eventos.

## Arranque rápido

```bash
cp .env.example .env                       # modelos, URLs locales y tokens de desarrollo
gcloud auth application-default login      # ADC para Gemini en Vertex AI (o MOCK_AI=1 en .env)
(cd agent && uv run playwright install chromium)
make up                                    # app :3000, Kilómetro :3001, Pulso :3002, agente :8000
```

- Abre `http://localhost:3000/configurar?clave=dev-admin` y registra una passkey (Touch ID). En la nube, ese mismo enlace (con el `ADMIN_TOKEN` real) también habilita el dispositivo para enviar encargos.
- Envía el encargo desde `http://localhost:3000` y míralo en `http://localhost:3000/presenter`.
- `make test` corre todas las pruebas sin red.

Los detalles (requisitos, nube, ensayo y día de la charla) están en [docs/ONBOARDING.md](docs/ONBOARDING.md).

## Comandos `make`

Variables: `TARGET=local|cloud` (por omisión `local`), `URL` (por omisión `http://localhost:3001`) y `RUNS` (por omisión `10`).

| Comando | Qué hace |
| --- | --- |
| `make help` | Lista los comandos con su descripción. |
| `make up` | Arranca en local la app (3000), Kilómetro (3001), Pulso (3002) y el agente (8000). Los logs quedan en `.data/logs/`. Ctrl-C detiene todo. |
| `make reset` | Vuelve al estado inicial: stock sembrado, sin carritos, checkouts ni pedidos, Pulso opaco y sin corridas, eventos, mandatos ni capturas. Las passkeys se conservan. Espera cada llamada y falla (con el servicio que no respondió) si alguna falla; solo entonces imprime `reset ok`. `TARGET=cloud` reinicia los servicios de Cloud Run. |
| `make test` | Kit de comercio (vitest), typecheck de las tiendas y de la app, agente (pytest con `MOCK_AI=1`, Firestore en memoria, sin navegador). |
| `make e2e` | Flujo de passkey en Chrome con el autenticador virtual de DevTools: registra → envía el encargo → firma el mandato → pedido confirmado. Borra la credencial al final. |
| `make e2e-emulator` | Lado del teléfono en el emulador Android (`emulator-5556`): encargo, progreso, tarjeta de aprobación y cancelación. Guarda capturas en `docs/screenshots/emulator/`. Por defecto va contra Cloud Run (el emulador no ve el `localhost` del portátil); con `TARGET=local` mapea el puerto 3000 con `adb reverse`. |
| `make bias-test` | 10 corridas con el modo de control apagado (espera Kilómetro) y 10 con el modo encendido (espera Pulso). Cada corrida va del encargo a la firma con passkey y al pedido. Escribe el reporte en `bias-results/`. |
| `make audit URL=…` | Checklist de preparación para agentes de cualquier tienda. |
| `make phone` | Abre el «teléfono» que firma: una ventana de Chrome de 390×844 en modo app, con la passkey del Mac (Touch ID). |
| `make screens` | Recorre la app en Chrome con una passkey virtual y captura cada pantalla en `docs/screenshots/app/`. |
| `make seed` | Regenera `catalog/catalog.json` (determinista, semilla 2027). |
| `make images` | Genera las fotos de producto y los anuncios de Pulso con `IMAGE_MODEL`, verificados con `GEMINI_MODEL`. |
| `make deploy` | Ejecuta `infra/10` a `infra/50`: APIs, secretos, tiendas, agente y app en Cloud Run. |

## Mapa del repositorio

```text
encargo/
├── AGENTS.md               especificación de la demo
├── Makefile                todos los comandos
├── VERSIONS.md             versiones de UCP, AP2 y dependencias
├── .env.example            modelos y configuración (copiar a .env)
├── catalog/
│   ├── seed.py             catálogo ficticio "Senda" (make seed)
│   ├── catalog.json        10 modelos, precio, stock y entrega por tienda
│   └── images/             fotos de estudio + anuncios de Pulso (pulso/), cada una con su .prompt.json
├── stores/
│   ├── shared/src/         kit de comercio: schemaOrg, merchantFeed, ucp/, ap2/, db (SQLite), delivery
│   ├── sync-shared.mjs     copia el kit y el catálogo dentro de cada tienda
│   ├── kilometro/          tienda lista para agentes (SSR, /feed.xml, /.well-known/ucp, /ucp/v1/…)
│   └── pulso/              tienda solo para humanos (CSR, fotos con texto, tallas en canvas)
├── agent/encargo/
│   ├── agent.py            agente ADK: instrucción y herramientas
│   ├── runner.py           una corrida: eventos, tiempo límite, decisión
│   ├── model.py            Gemini con llamadas cubiertas (hedged)
│   ├── errand.py           el encargo → cuatro condiciones (y la regla del viernes)
│   ├── tools/              discovery, product_feed, ucp_client, structured_data, browser, checklist, approval, agent_view
│   ├── passkey.py          WebAuthn: registro y firma ligada al checkout
│   ├── purchase.py         firma el mandato y completa (solo desde el endpoint humano)
│   ├── ap2/                SD-JWT ES256, firma de la tienda
│   ├── runstore/           Firestore (nube) o memoria (pruebas)
│   ├── audit.py            make audit
│   ├── bias_test.py        make bias-test
│   ├── mock_planner.py     MOCK_AI=1: planificador determinista con las mismas herramientas
│   └── api.py              FastAPI: /runs, SSE, /mandates, /passkeys, /audit, /.well-known/ucp
├── app/src/
│   ├── app/                /, /encargo/[id], /presenter, /configurar, /auditoria, /api/agent (proxy), /api/control
│   ├── components/         ErrandForm, RunPhone, Presenter, PasskeySetup, AuditView
│   └── lib/                useRun (SSE), runState (eventos → pantalla)
├── infra/                  10-enable-apis, 20-secrets, 30-deploy-stores, 40-deploy-agent, 50-deploy-app
├── scripts/                up.sh, reset.sh, e2e_passkey.py, e2e_emulator.py, screens_app.py, generate_product_images.py
├── data/                   SOURCES.md, DATASHEET.md
└── docs/                   ONBOARDING.md, diagrams/, screenshots/
```

## Decisiones técnicas

### Versiones de UCP y AP2

- **UCP `2026-08-25`**, la última versión publicada (rama `release/2026-08-25`). Las tiendas publican un perfil de negocio en `/.well-known/ucp`: servicio `dev.ucp.shopping` con transporte REST, capacidades `catalog.search`, `catalog.lookup`, `cart` y `checkout`, extensiones `fulfillment` y `dev.ucp.common.payment.ap2_mandate`, y la llave pública de la tienda en `keys[]`. Los montos van en centavos. El agente se identifica con el encabezado `UCP-Agent: profile="…"`, que apunta a su propio perfil. No hay SDK oficial para TypeScript, así que el perfil y los endpoints se implementan desde la especificación (`stores/shared/src/ucp/`).
- **AP2 v0.2**: mandato de checkout cerrado (`vct: "mandate.checkout.1"`) como **SD-JWT firmado con ES256**. Lleva el `checkout_jwt` de la tienda y su `checkout_hash` como divulgaciones. Sigue el modelo de «plataforma de confianza» de la extensión AP2 Mandates de UCP: la plataforma Encargo firma con la llave publicada en el `/.well-known/ucp` del agente. La tienda solo acepta perfiles de `TRUSTED_PLATFORM_PROFILES`. Así, un agente desconocido no puede traer su propia llave.
- El formato se implementa en los dos lados con primitivas mínimas: `jose` en TypeScript y `cryptography` en Python. JCS (RFC 8785) se usa para la firma desacoplada de la tienda.
- **Descartado:** la cadena de delegación abierta → cerrada del SDK de AP2 y el mandato de pago. Los pagos son sandbox (`sandbox_pay`, tarjeta de prueba •••• 4242): nunca se mueve dinero real.
- Las versiones de todas las dependencias están en [VERSIONS.md](VERSIONS.md).

### Por qué Pulso es opaco sin bloquear bots

El `robots.txt` de Pulso dice `User-agent: *` / `Allow: /`. No hay CAPTCHAs, 403 ni filtros por user-agent. Pulso simplemente no es legible para una máquina:

- Los datos están en píxeles: el nombre y el precio en las fotos, y las tallas en un `canvas`.
- Las URL son opacas (`/p/<token>`, `/v/<token>.jpg`), sin el nombre del modelo.
- El HTML que manda el servidor es un cascarón vacío.
- La fecha de entrega aparece solo después de iniciar sesión.

**Por qué:** si Pulso bloqueara bots, la lección sería «me bloquearon», y la prueba de sesgo tendría una explicación trivial. Así, el agente puede entrar, navegar con Chromium y hacer una captura. Aun así, no encuentra ningún dato que pueda verificar. Es el caso real de muchas tiendas bonitas.

**Descartado:** bloquear user-agents o mostrar CAPTCHAs. Eso enseña otra cosa.

### El guardarraíl del agente

La regla «solo se compra donde todo cumple» está en el código, no solo en la instrucción:

- `request_payment_approval` se niega si `ctx.all_met(store)` es falso (o si faltan condiciones) y le devuelve al modelo el estado de cada una. También se niega si `checkout_problems` encuentra que el checkout firmado no es el encargo.
- Una sola firma gana: el mandato pasa de `pending_signature` a `signing` en una transacción de Firestore, y la tienda reclama el checkout (`UPDATE … WHERE status='ready_for_complete'`) antes del primer `await`. Si la tienda responde con un error (aunque no sea JSON), la corrida termina en «fallida», con su evento, y el presentador lo muestra.
- Hay un solo mandato pendiente por corrida.
- Ninguna herramienta firma ni completa un pago (`test_agent_has_no_tool_that_signs_or_pays`).

`record_check` solo acepta `met`, `not_met` o `not_verifiable` y una evidencia en una frase. Esa misma fila es la que ve el público en la vista del presentador.

**Por qué:** una instrucción se puede ignorar; una función que devuelve error no.

**Descartado:** confiar en que el modelo «decida bien». Funciona casi siempre, pero el escenario no admite «casi».

### Llamadas al modelo con cobertura contra la latencia de cola

La corrida completa tiene que terminar en menos de 2 minutos. Una llamada a Gemini suele tardar unos 2 segundos, pero en un endpoint compartido algunas tardan entre 15 y 90 s. Se midió que no eran 429, solo latencia de cola. Por eso `HedgedGemini` (`agent/encargo/model.py`) hace llamadas cubiertas:

- Si la primera llamada no responde en `MODEL_HEDGE_AFTER_S` (6 s por omisión), envía una segunda llamada idéntica, y luego una tercera.
- Gana la primera respuesta y las demás se cancelan.
- Los errores 429, 500 y 503 los reintenta el SDK con *backoff* (5 intentos).
- El agente usa `thinking_level=LOW` y la corrida tiene un tope de `RUN_TIMEOUT_S` (110 s).

**Descartado:** subir los tiempos de espera (no acorta la cola) y reintentar solo después de un timeout (paga la espera completa antes de reintentar).

### Firestore para el estado de las corridas

Las corridas, los eventos, los mandatos, los pedidos, las capturas, las passkeys y los desafíos WebAuthn viven en Firestore, en la base `encargo` (`agent/encargo/runstore/firestore.py`).

- Los eventos son una subcolección `runs/{id}/events/{seq}`. Así, «eventos después de N» no necesita un índice compuesto.
- El endpoint SSE consulta cada 0.4 s y entrega los eventos en orden estricto. Las herramientas en paralelo pueden escribir el evento N+1 antes que el N.
- `make reset` cancela las corridas en curso y borra en paralelo corridas, mandatos, pedidos, capturas y desafíos WebAuthn pendientes. Las escrituras tardías no resucitan corridas borradas (`update`, no `set(merge=True)`). Las passkeys sobreviven, porque son de la persona y no de una corrida.

### Quién puede hacer qué durante la charla

- **Enviar un encargo o cancelar un pago** (`POST /runs`, `POST /mandates/{id}/reject`): en modo `passkey`, solo un dispositivo habilitado. El enlace de configuración (`/configurar?clave=<ADMIN_TOKEN>`) le entrega el token de escenario (`STAGE_TOKEN`) y borra la clave de la barra de direcciones.
- **Pagar:** solo una passkey registrada, con un desafío atado al checkout.
- **Ver:** el presentador es anónimo. `/runs/latest` no le muestra el `mandate_id`.
- **Cambiar o cancelar un checkout en la tienda:** solo quien tenga su llave (encabezado `ucp-checkout-token` al crearlo) o la llave de administración de la tienda.
- **Auditar:** `/audit` solo consulta hosts públicos http(s), además de las dos tiendas de la demo (protección SSRF, también en redirecciones).
- **Administrar** (reset, modo de control, registrar o borrar passkeys): `ADMIN_TOKEN`. Sin él, en producción o en modo `passkey`, esos endpoints fallan cerrados; `dev-admin` solo existe en local.
- Las pruebas usan `MemoryRunStore`, con la misma interfaz.

**Por qué:** el agente, la app, el presentador y la prueba de sesgo leen el mismo estado, y un reinicio de la instancia no borra lo que el público está viendo.

**Descartado:** guardar el estado en la memoria del contenedor (se pierde con un reinicio) y SQLite en el agente (los demás servicios no lo pueden leer).

### Los cuatro servicios en Cloud Run (y el teléfono no depende de la red del lugar)

| Componente | Dónde | Configuración | Por qué |
| --- | --- | --- | --- |
| Pulso, Kilómetro | Cloud Run | 1 instancia mínima y máxima, 512 MiB | El stock, los checkouts y la llave de la tienda viven en SQLite dentro del proceso. `make reset` los restaura. |
| Agente | Cloud Run | 1 instancia, CPU siempre activa, 2 vCPU, 2 GiB, timeout de 3600 s | La corrida sigue después de responder `POST /runs`. Chromium necesita memoria. El estado está en Firestore. |
| App | Cloud Run | 1 a 2 instancias, 512 MiB | Su dominio `run.app` es el RP ID de las passkeys. |
| Firestore `encargo`, Vertex AI | Google Cloud | `nam5`; Gemini en `global` | Servicios gestionados. |
| Ventana de firma y navegador del presentador | Portátil | Chrome | Solo muestran páginas de la app. Ver «Quién firma». |

Todas las URL son HTTPS públicas y deterministas (`https://SERVICIO-NUMERO_DE_PROYECTO.us-central1.run.app`, `infra/urls.sh`). Así, cada servicio conoce a los otros antes de existir.

Ni el «teléfono» ni el emulador necesitan la red local del auditorio: les basta con salida a internet.

- **Por qué:** WebAuthn exige un contexto seguro (HTTPS o `localhost`). Una IP del portátil en la red local por `http://` ni siquiera permitiría usar passkeys.
- **Por qué:** la red del lugar suele aislar a los clientes entre sí.

**Descartado:** servir todo desde el portátil y conectar el teléfono por Wi-Fi.

### Quién firma: el portátil con Touch ID, en una ventana del tamaño de un teléfono

En el escenario, el dispositivo que firma el mandato es el portátil. `make phone TARGET=cloud` abre Chrome en modo app, a 390×844, y la passkey usa el autenticador del Mac (Touch ID).

**Por qué no el teléfono:** la charla no usa un teléfono real. El «teléfono» es el emulador Android `emulator-5556`, y ahí Chrome no puede crear passkeys sin iniciar sesión con una cuenta de Google. Sin un proveedor de credenciales, solo ofrece «Create passkey on another device?» (QR híbrido; ver `docs/screenshots/emulator/passkey-sheet.png`). Además, Chrome para Android no expone el autenticador virtual de DevTools. Se descartó iniciar sesión con una cuenta de Google en el emulador.

Qué se prueba en cada lugar:

- **En el emulador** (`make e2e-emulator`): se envía el encargo, se sigue la corrida, se muestra la tarjeta de aprobación y se cancela, sin cobro. Con `--try-passkey` también registra la hoja nativa de passkey.
- **En pruebas automáticas** (`make e2e`): Chrome de escritorio con el autenticador virtual de DevTools (passkey de plataforma con verificación de usuario).
- **En la prueba de sesgo** (`make bias-test`): firma con un autenticador de software (`agent/encargo/software_authenticator.py`) por el mismo camino WebAuthn.

En la nube, el agente corre con `SIGNER_MODE=passkey`: solo una aserción WebAuthn aprueba un pago. El token de firmador de prueba (`HUMAN_APPROVAL_TOKEN`) solo se acepta con `SIGNER_MODE=test`, que es el valor local. Para registrar una passkey hace falta el código de configuración (`ADMIN_TOKEN`), así que nadie del público puede inscribir su dispositivo.

### La regla del viernes

«Antes del viernes» se calcula, nunca se guarda (`agent/encargo/errand.py` y `stores/shared/src/delivery.ts`). Todas las fechas usan la hora de Guatemala (UTC-6):

- **Plazo:** el primer viernes *estrictamente posterior* a la fecha de la corrida. Entregar ese viernes cuenta como a tiempo. Si la corrida es un viernes, el plazo es el viernes siguiente.
- **Llegada:** la fecha de la corrida + el máximo de preparación + el máximo de tránsito, en días hábiles (lunes a viernes).
- **Consecuencia:** el modelo del encargo, Senda Acatenango T3 (0 + 1 días hábiles), siempre llega a tiempo. El peor caso es una corrida en jueves, que llega el viernes. Senda Fuego Tormenta (7 a 10 días) nunca llega.

El encargo se interpreta con un parser determinista (expresiones regulares) y no con el modelo. Así, las cuatro condiciones (`categoria`, `talla`, `precio`, `entrega`) son idénticas en todas las corridas, que es lo que necesita la prueba de sesgo. Pruebas: `agent/tests/test_errand.py`.

### Otras decisiones

- **Ningún modelo está escrito en el código.** `GEMINI_MODEL` e `IMAGE_MODEL` vienen de `.env` (ver `.env.example`).
- **`MOCK_AI=1`** reemplaza a Gemini por un planificador determinista (`agent/encargo/mock_planner.py`). Recorre las mismas herramientas, el mismo checklist, el mismo guardarraíl y el mismo flujo de mandato. Sirve para las pruebas y para ensayar sin red.
- **El kit de comercio se copia en lugar de compartirse como paquete** (`stores/sync-shared.mjs`). Cloud Build construye cada tienda por separado, así que todo lo que necesita debe vivir dentro de su carpeta. Las copias se generan y están en `.gitignore`.

## Resultados de la prueba de sesgo

`make bias-test TARGET=cloud`, 2026-09-30 (19:33), contra Cloud Run, con Gemini y una passkey de software:

| Modo de control | Tienda esperada | Aciertos | Pedidos completados | Tiempo promedio | Tiempo máximo |
| --- | --- | --- | --- | --- | --- |
| Apagado (Pulso opaco) | Kilómetro | **10/10** | 10 | 29.1 s | 40.6 s |
| Encendido (Pulso legible) | Pulso | **10/10** | 10 | 20.1 s | 27.3 s |

El criterio es ≥ 9 de 10 por modo y cada corrida < 120 s, del encargo al pedido confirmado. Las otras dos series completas de ese día también dieron 10/10 en los dos modos:

- 14:53: promedio de 44.9 s y 23.8 s.
- 16:21: promedio de 32.1 s y 40.3 s; el máximo fue 110.6 s, el caso que motivó las llamadas cubiertas.

Los reportes JSON quedan en `bias-results/` (local, fuera de git).

## URLs desplegadas

| Servicio | URL |
| --- | --- |
| App (teléfono) | https://encargo-app-611681112050.us-central1.run.app |
| Presentador | https://encargo-app-611681112050.us-central1.run.app/presenter |
| Auditoría | https://encargo-app-611681112050.us-central1.run.app/auditoria |
| Kilómetro | https://encargo-kilometro-611681112050.us-central1.run.app |
| Pulso | https://encargo-pulso-611681112050.us-central1.run.app |
| Agente | https://encargo-agent-611681112050.us-central1.run.app (`/health`, `/.well-known/ucp`) |

Usa siempre estas URL y no los alias `…-uc.a.run.app`. La passkey está ligada al nombre de host de la app (RP ID), y con otro host la firma falla.

## Procedencia de las imágenes

- Todas las fotos son **generadas** con `IMAGE_MODEL` (Nano Banana 2 Lite vía Vertex AI) por `scripts/generate_product_images.py` (`make images`).
- **El prompt está junto a cada imagen.** Cada `catalog/images/<modelo>.jpg` tiene su `<modelo>.prompt.json`, con el modelo, el prompt, el intento, el resultado de la verificación y el `origin` (`synthetic`).
- **No hay marcas reales.** «Senda» es una marca ficticia. Las fotos de estudio deben salir sin texto ni logos, y `GEMINI_MODEL` lo verifica como juez visual: si falla, la imagen se regenera.
- Los anuncios de Pulso (`catalog/images/pulso/`) son ediciones de esas fotos con el nombre y el precio pintados. Un OCR con `GEMINI_MODEL` exige que el texto sea exacto.
- Los logos de las marcas están en `app/public/brand/` y `stores/*/public/brand/`.

Los datos son sintéticos: ver [data/SOURCES.md](data/SOURCES.md) y [data/DATASHEET.md](data/DATASHEET.md).

## Más documentación

- [docs/ONBOARDING.md](docs/ONBOARDING.md): instalación, nube, pruebas, recorrido del código, solución de problemas y checklist del día de la charla.
- [docs/diagrams/](docs/diagrams/): arquitectura, secuencia de una compra y matriz de lo que lee el agente (HTML, SVG y PNG).
- [VERSIONS.md](VERSIONS.md): versiones de los protocolos y las dependencias.
