# Decisiones técnicas

Por qué Encargo está hecho así: el detalle de lo que enseña la demo, cada decisión con lo descartado, las versiones de UCP y AP2, y los resultados de la prueba de sesgo. Volver al [README](../README.md). [English version](DECISIONES.en.md).

## El escenario

Encargo es un agente que compra por una persona. En el escenario recibe un solo encargo:

> «Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes.»

También recibe dos tiendas ficticias que venden los mismos tenis:

- **Pulso** es espectacular y más barata (139 USD), pero solo la puede leer una persona. El nombre y el precio están pintados dentro de las fotos. Las tallas están dibujadas en un `canvas`. La fecha de entrega aparece solo al final del pago, después de iniciar sesión.
- **Kilómetro** es sobria y más cara (145 USD), pero está lista para agentes. Publica schema.org, un feed de Merchant Center y un perfil UCP, y su checkout exige un mandato AP2 firmado por la persona.

Encargo compra en Kilómetro porque es la única tienda donde puede verificar cada condición. Con el modo de control encendido (`PULSO_AGENT_READY=true`), Pulso publica los mismos datos y Encargo compra en Pulso, porque es más barata. El agente no prefiere ninguna tienda: solo usa lo que puede comprobar.

## Qué vas a aprender, en detalle

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

![Qué puede leer el agente en cada tienda](diagrams/agent-readability-matrix.png)

### 2. El embudo colapsa

El agente lee la portada solo para descubrir la capa para máquinas. `inspect_store` (`agent/encargo/tools/discovery.py`) busca en los lugares conocidos: `/.well-known/ucp`, `/robots.txt`, `/feed.xml` y `/sitemap.xml` (y toma de la portada el título y los enlaces). Con eso pasa directo a feed → perfil → checkout → mandato. No hay banner, recomendación ni página de categoría que lo distraiga. El presentador lo muestra en vivo en la franja «camino»: siete pantallas para una persona (portada → catálogo → producto → talla → carrito → login → checkout) frente a tres pasos del agente (perfil/feed → carrito → mandato), que se llenan conforme avanza la ejecución.

![El embudo colapsa](diagrams/funnel.png)

Las herramientas del agente son exactamente ese embudo corto: `inspect_store`, `read_product_feed`, `search_catalog`, `fetch_page`, `browse_page`, `record_checklist`, `create_checkout` y `request_payment_approval` (`agent/encargo/agent.py`). En Cloud Run, una ejecución completa, del encargo al pedido confirmado, tardó en la última prueba de sesgo (2026-10-01) **54.9 s de promedio con el modo apagado y 51.9 s con el modo encendido; el máximo fue 110.6 s** (ver [resultados](#resultados-de-la-prueba-de-sesgo)). La latencia depende de Gemini ese día. Regla del presentador: a los 60 s el reloj se pone ámbar y el botón «Ver la ejecución grabada» también; un clic cambia a la ejecución grabada (ver «Plan B»).

### 3. El modo de control demuestra que el agente no tiene sesgo

- `PULSO_AGENT_READY` (`stores/shared/src/store.ts`) enciende en Pulso la misma capa para máquinas que tiene Kilómetro. `agentReadyOnly` (`stores/shared/src/ucp/http.ts`) abre o cierra el feed, el sitemap, el perfil UCP y los endpoints de UCP. La página de producto (`stores/pulso/src/app/p/[slug]/page.tsx`) agrega el mismo JSON-LD.
- El agente no recibe ninguna pista: `POST /runs` solo lleva el encargo. Las tiendas las fija el servidor (`STORE_URLS`) y las baraja en cada ejecución, así que la posición en la lista no puede decidir (`agent/encargo/api.py`). La instrucción dice «trata a todas las tiendas exactamente igual».
- `make bias-test` hace 10 ejecuciones con el modo apagado y 10 con el modo encendido, y registra el orden que vio cada ejecución (`agent/encargo/bias_test.py`). Prueba rápida sin red: `test_control_mode_buys_where_it_is_cheaper`.

### 4. Confianza: un mandato AP2 firmado con passkey

El agente puede armar el carrito, pero no puede pagar:

- `request_payment_approval` (`agent/encargo/tools/approval.py`) solo pide la aprobación si las **cuatro** condiciones de esa tienda están en «cumple» (un encargo sin las cuatro nunca se compra). Además revisa, sin el modelo, el checkout que firmó la tienda (`agent/encargo/checkout_rules.py`): exactamente un par, la talla pedida, total menor al tope en USD y entrega a más tardar en la fecha límite.
- La tienda firma cada checkout (`merchant_authorization`, `stores/shared/src/ap2/merchantAuthorization.ts`). El agente verifica esa firma con la llave del perfil UCP de la tienda antes de mostrarle los términos a la persona (`agent/encargo/ap2/merchant_signature.py`).
- La persona firma con su passkey un desafío derivado de ese checkout: `sha256(checkout_hash + "." + nonce)` (`agent/encargo/passkey.py`). Por eso la firma aprueba ese carrito y ningún otro.
- Solo después de esa firma la plataforma emite el mandato AP2 (`agent/encargo/ap2/signer.py`) y completa la compra (`agent/encargo/purchase.py`). A ese módulo solo se llega desde el endpoint humano; ninguna herramienta del agente lo alcanza.
- La tienda rechaza `complete` si no recibe un mandato válido, si lo firmó una plataforma en la que no confía o si aprueba otros términos (`stores/shared/src/ap2/checkoutMandate.ts`, `platformKeys.ts`).

Pruebas: `agent/tests/test_no_payment_without_mandate.py`, `agent/tests/test_passkey_approval.py` y `stores/shared/tests/noPaymentWithoutMandate.test.ts`.

![Secuencia de una compra](diagrams/purchase-sequence.png)

### 5. El checklist práctico: `make audit`

`make audit URL=$KILOMETRO_URL` (`agent/encargo/audit.py`, sirve con la URL de cualquier tienda) revisa con solo peticiones GET. No crea carritos ni checkouts. Califica ocho puntos:

1. Datos estructurados schema.org (Product + Offer).
2. Disponibilidad por talla o variante.
3. Tiempo de entrega legible por máquinas.
4. Feed de productos.
5. Perfil UCP.
6. API de checkout.
7. Autorización de pago AP2.
8. Contenido visible sin JavaScript.

Cada punto que falla dice qué hacer. La misma auditoría está en la app, en `/auditoria`, pensada para el público: cada punto en lenguaje de negocio (qué es, por qué lo necesita un agente y cómo arreglarlo, también para los que ya cumple), con el detalle técnico plegable; los ocho caben en una pantalla de 1080p, hay un QR para abrirla desde el teléfono y el checklist se imprime, se guarda como PDF o se descarga en Markdown. `/audit` es público pero limitado: 6 auditorías por minuto por persona, solo hosts públicos http(s) y un máximo de 2 a la vez, aparte de las ejecuciones del agente. Resultado en Cloud Run: Kilómetro 8/8, Pulso 0/8.

## Decisiones

### Versiones de UCP y AP2

- **UCP `2026-08-25`**, la última versión publicada (rama `release/2026-08-25`). Las tiendas publican un perfil de negocio en `/.well-known/ucp`: servicio `dev.ucp.shopping` con transporte REST, capacidades `catalog.search`, `catalog.lookup`, `cart` y `checkout`, extensiones `fulfillment` y `dev.ucp.common.payment.ap2_mandate`, y la llave pública de la tienda en `keys[]`. Los montos van en centavos. El agente se identifica con el encabezado `UCP-Agent: profile="…"`, que apunta a su propio perfil. No hay SDK oficial para TypeScript, así que el perfil y los endpoints se implementan desde la especificación (`stores/shared/src/ucp/`).
- **AP2 v0.2**: mandato de checkout cerrado (`vct: "mandate.checkout.1"`) como **SD-JWT firmado con ES256**. Lleva el `checkout_jwt` de la tienda y su `checkout_hash` como divulgaciones. Sigue el modelo de «plataforma de confianza» de la extensión AP2 Mandates de UCP: la plataforma Encargo firma con la llave publicada en el `/.well-known/ucp` del agente. La tienda solo acepta perfiles de `TRUSTED_PLATFORM_PROFILES`. Así, un agente desconocido no puede traer su propia llave.
- El formato se implementa en los dos lados con primitivas mínimas: `jose` en TypeScript y `cryptography` en Python. JCS (RFC 8785) se usa para la firma desacoplada de la tienda.
- **Descartado:** la cadena de delegación abierta → cerrada del SDK de AP2 y el mandato de pago. Los pagos son sandbox (`sandbox_pay`, tarjeta de prueba •••• 4242): nunca se mueve dinero real.
- Las versiones de todas las dependencias están en [VERSIONS.md](../VERSIONS.md).

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
- Una sola firma gana: el mandato pasa de `pending_signature` a `signing` en una transacción de Firestore, y la tienda reclama el checkout (`UPDATE … WHERE status='ready_for_complete'`) antes del primer `await`. Si la tienda responde con un error (aunque no sea JSON), la ejecución termina en «fallida», con su evento, y el presentador lo muestra.
- Hay un solo mandato pendiente por ejecución.
- Ninguna herramienta firma ni completa un pago (`test_agent_has_no_tool_that_signs_or_pays`).

`record_checklist` registra las cuatro filas de una tienda en una sola llamada (una salida corta mantiene rápida la ejecución); cada fila solo acepta `met`, `not_met` o `not_verifiable` y una evidencia breve. Esa misma fila es la que ve el público en la vista del presentador.

**Por qué:** una instrucción se puede ignorar; una función que devuelve error no.

**Descartado:** confiar en que el modelo «decida bien». Funciona casi siempre, pero el escenario no admite «casi».

### Llamadas al modelo con cobertura contra la latencia de cola

La ejecución completa tiene que terminar en menos de 2 minutos. Una llamada a Gemini suele tardar unos 2 segundos, pero en un endpoint compartido algunas tardan entre 15 y 90 s. Se midió que no eran 429, solo latencia de cola. Por eso `HedgedGemini` (`agent/encargo/model.py`) hace llamadas cubiertas:

- Si la primera llamada no responde en `MODEL_HEDGE_AFTER_S` (6 s por omisión), envía una segunda llamada idéntica, y luego más, hasta `MODEL_MAX_PARALLEL` (5) a la vez.
- Gana la primera respuesta. Las demás no se cancelan: se dejan terminar solas, porque cancelar peticiones HTTP en vuelo dejaba atascadas conexiones del pool (se vio en Cloud Run).
- Una llamada que falla (por ejemplo, 504 DEADLINE_EXCEEDED) libera su lugar para una nueva, hasta 12 llamadas por turno.
- Los errores 429, 500 y 503 los reintenta el SDK con *backoff* (5 intentos).
- El agente usa `thinking_level=LOW` y la ejecución tiene un tope de `RUN_TIMEOUT_S` (110 s).

**Descartado:** subir los tiempos de espera (no acorta la cola) y reintentar solo después de un timeout (paga la espera completa antes de reintentar).

### Firestore para el estado de las ejecuciones

Las ejecuciones, los eventos, los mandatos, los pedidos, las capturas, las passkeys y los desafíos WebAuthn viven en Firestore, en la base `encargo` (`agent/encargo/runstore/firestore.py`).

- Los eventos son una subcolección `runs/{id}/events/{seq}`. Así, «eventos después de N» no necesita un índice compuesto.
- El endpoint SSE consulta cada 0.4 s y entrega los eventos en orden estricto. Las herramientas en paralelo pueden escribir el evento N+1 antes que el N.
- Un reinicio («Empezar de nuevo» en el presentador, o `make reset` en desarrollo) cancela las ejecuciones en curso y borra en paralelo ejecuciones, mandatos, pedidos, capturas y desafíos WebAuthn pendientes. Las escrituras tardías no resucitan ejecuciones borradas (`update`, no `set(merge=True)`). Las passkeys sobreviven, porque son de la persona y no de una ejecución.

### Quién puede hacer qué durante la charla

- **Enviar un encargo, cancelar un pago, «Empezar de nuevo» y el modo de control** (`POST /runs`, `POST /mandates/{id}/reject`, `POST /stage/reset`, `POST /stage/control`): en modo `passkey`, solo un navegador habilitado. «Habilitar con Touch ID» le entrega el token de escenario (`STAGE_TOKEN`) a quien firma con la passkey registrada; el enlace de configuración (`/configurar?clave=<ADMIN_TOKEN>`) también, y borra la clave de la barra de direcciones. El reinicio y el modo de control los ejecuta el agente con su `ADMIN_TOKEN`: el navegador nunca lo ve.
- **Preparar el escenario** (`POST /stage/warmup`, `GET /stage/status`): público y barato de repetir. Despierta los servicios y dice qué está listo; la llamada a Gemini y el arranque de Chromium van como mucho cada 5 minutos, y el reinicio automático solo ocurre tras más de 10 minutos sin encargos y sin uno en curso.
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
| Pulso, Kilómetro | Cloud Run | 0 a 1 instancias, 512 MiB | El stock, los checkouts y la llave de la tienda viven en SQLite dentro del proceso. Un reinicio (o un arranque en frío) los restaura. |
| Agente | Cloud Run | 0 a 1 instancias, CPU siempre activa, 2 vCPU, 2 GiB, timeout de 3600 s | La ejecución sigue después de responder `POST /runs`. Chromium necesita memoria. El estado está en Firestore. |
| App | Cloud Run | 0 a 2 instancias, 512 MiB | Su dominio `run.app` es el RP ID de las passkeys. |
| Firestore `encargo`, Vertex AI | Google Cloud | `nam5`; Gemini en `global` | Servicios gestionados. |
| Ventana de firma y navegador del presentador | Portátil | Chrome | Solo muestran páginas de la app. Ver «Quién firma». |

Todas las URL son HTTPS públicas y deterministas (`https://SERVICIO-NUMERO_DE_PROYECTO.us-central1.run.app`, `infra/urls.sh`). Así, cada servicio conoce a los otros antes de existir.

Ni el «teléfono» ni el presentador necesitan la red local del auditorio: les basta con salida a internet.

- **Por qué:** WebAuthn exige un contexto seguro (HTTPS o `localhost`). Una IP del portátil en la red local por `http://` ni siquiera permitiría usar passkeys.
- **Por qué:** la red del lugar suele aislar a los clientes entre sí.

**Descartado:** servir todo desde el portátil y conectar el teléfono por Wi-Fi.

### Quién firma: el portátil con Touch ID, en una ventana del tamaño de un teléfono

En el escenario, el dispositivo que firma el mandato es el portátil: la página del teléfono abierta en una ventana de Chrome junto al presentador, y la passkey usa el autenticador del Mac (Touch ID). En pantallas anchas la app se dibuja como un teléfono centrado, así que no hace falta ajustar la ventana.

**Por qué no el teléfono:** la charla no usa un teléfono real. El «teléfono» es el emulador Android `Pixel_9_API_36_1`, y ahí Chrome no puede crear passkeys sin iniciar sesión con una cuenta de Google. Sin un proveedor de credenciales, solo ofrece «Create passkey on another device?» (QR híbrido; ver `docs/screenshots/emulator/passkey-sheet.png`). Además, Chrome para Android no expone el autenticador virtual de DevTools. Se descartó iniciar sesión con una cuenta de Google en el emulador.

Qué se prueba en cada lugar:

- **En el emulador** (`make e2e-emulator`): se envía el encargo, se sigue la ejecución, se muestra la tarjeta de aprobación y se cancela, sin cobro. Con `--try-passkey` también registra la hoja nativa de passkey.
- **En pruebas automáticas** (`make e2e`): Chrome de escritorio con el autenticador virtual de DevTools (passkey de plataforma con verificación de usuario).
- **En la prueba de sesgo** (`make bias-test`): firma con un autenticador de software (`agent/encargo/software_authenticator.py`) por el mismo camino WebAuthn.

En la nube, el agente corre con `SIGNER_MODE=passkey`: solo una aserción WebAuthn aprueba un pago. El token de firmador de prueba (`HUMAN_APPROVAL_TOKEN`) solo se acepta con `SIGNER_MODE=test`, que es el valor local. Para registrar una passkey hace falta el código de configuración (`ADMIN_TOKEN`), así que nadie del público puede inscribir su dispositivo.

### La regla del viernes

«Antes del viernes» se calcula, nunca se guarda (`agent/encargo/errand.py` y `stores/shared/src/delivery.ts`). Todas las fechas usan la hora de Guatemala (UTC-6):

- **Plazo:** el primer viernes *estrictamente posterior* a la fecha de la ejecución. Entregar ese viernes cuenta como a tiempo. Si la ejecución es un viernes, el plazo es el viernes siguiente.
- **Llegada:** la fecha de la ejecución + el máximo de preparación + el máximo de tránsito, en días hábiles (lunes a viernes).
- **Consecuencia:** el modelo del encargo, Senda Acatenango T3 (0 + 1 días hábiles), siempre llega a tiempo. El peor caso es una ejecución en jueves, que llega el viernes. Senda Fuego Tormenta (7 a 10 días) nunca llega.

El encargo se interpreta con un parser determinista (expresiones regulares) y no con el modelo. Así, las cuatro condiciones (`categoria`, `talla`, `precio`, `entrega`) son idénticas en todas las ejecuciones, que es lo que necesita la prueba de sesgo. Pruebas: `agent/tests/test_errand.py`.

### El día de la charla no se corre nada: la página del presentador prepara el escenario

Los cuatro servicios quedan con 0 instancias mínimas (`MIN_INSTANCES`, 0 por omisión), así que nada se cobra las 24 horas. Al abrirse, `/presentador` llama a `POST /stage/warmup` del agente (`agent/encargo/stage.py`):

- despierta las tiendas (portada, feed y perfil UCP) y el agente;
- hace una llamada corta a Gemini y arranca Chromium, como mucho cada 5 minutos;
- si pasaron más de 10 minutos desde el último encargo y no hay uno en curso, reinicia: stock completo, sin pedidos ni encargo en pantalla, modo de control apagado.

Después consulta `GET /stage/status` cada 3 s y muestra «Preparando la demo…» con cada parte hasta que todo responde. Desde 0 instancias tarda unos 16 s (medido el 6 oct 2026 con instancias nuevas, reinicio incluido). Mientras la página siga abierta, cada 4 minutos vuelve a despertar los servicios, así que Cloud Run no los apaga a mitad de la charla.

**Arranque en frío más corto (7 oct 2026).** El que más tardaba en arrancar era el agente: unos 12 s entre que Cloud Run crea la instancia y el servidor responde, contra ~1.5 s de las tiendas y la app. Tres cambios baratos: la imagen del agente instala solo el Chromium sin interfaz (`playwright install --only-shell`; el agente nunca abre una ventana), con lo que pasa de 677 MB a 492 MB; el servidor arranca directo desde el entorno virtual, sin pasar por `uv run`; y el presentador despierta las tiendas al mismo tiempo que el agente, en vez de esperar a que el agente las despierte. Medido en Cloud Run: el agente arranca en 5.5–9.5 s. Todos los servicios ya tenían el impulso de CPU al arrancar (`startup-cpu-boost`).

Lo que antes revisaba un portero de línea de comandos ahora lo dice la página: tiendas que no responden, que no haya passkey o que quede poco stock de la talla 9.

**Descartado:**

- Dejar una instancia mínima siempre encendida: cuesta todo el año por unas horas de escenario.
- Comandos el día de la charla (subir instancias, calentar, revisar y reiniciar desde una terminal): son pasos que se olvidan y que alguien tiene que saber correr. La página hace lo mismo al abrirse.

### Plan B: una ejecución real grabada

Si Gemini va lento en vivo, el presentador no espera. `make record-replay` graba una ejecución real en la nube (eventos y capturas) en `app/public/replays/kilometro.json` y `pulso-control.json`, con las capturas dentro de cada archivo. La app la reproduce con los tiempos originales y sin agente ni Gemini (`app/src/lib/useReplay.ts`):

- **«Ver la ejecución grabada»** en el presentador (abajo a la derecha; en ámbar si la ejecución en vivo pasa de 60 s o se detiene) cambia a la grabación, la del modo de control si está encendido.
- El teléfono y el presentador corren en el mismo Chrome del portátil y se coordinan con un `BroadcastChannel`: el teléfono pasa solo a la misma grabación (`/encargo/demo-<nombre>`) y su firma continúa la del presentador. «Volver a lo en vivo» regresa los dos.
- **Honestidad:** una franja grande y fija dice «REPETICIÓN GRABADA», el día en que se grabó y «no es en vivo», el modo de control mostrado es el de la grabación, y la repetición se detiene en la tarjeta de aprobación hasta una firma: la passkey del portátil (Touch ID) en el teléfono, o, si el teléfono no está abierto, «Continuar con firma simulada». La confirmación dice cuál firmó; nunca «firmado con passkey» si no firmó una passkey.
- **Último recurso, sin internet en el lugar:** el video [`docs/plan-b-replay.mp4`](plan-b-replay.mp4) de una ejecución completa (`make plan-b-video VIDEO=1` lo genera desde la app desplegada).

Las fechas de la grabación son las del día en que se grabó, y la franja dice ese día, así que la grabación no caduca con el calendario. Caduca cuando cambia lo que capturó: `make record-replay` guarda una huella del catálogo (`catalog/catalog.json`) y del texto del encargo, y `make test` falla si la huella de una grabación ya no coincide (`agent/encargo/replay_check.py`). Quien cambie el catálogo o el encargo vuelve a grabar y despliega la app en el mismo cambio.

**Descartado:** servir la app y las grabaciones desde el portátil sin internet. Todo vive en la nube; sin red, queda el video.

### CI con GitHub Actions

`.github/workflows/test.yml` corre `make test` en cada push y pull request, sin nube ni Gemini (`MOCK_AI=1`, tiendas falsas, SQLite en memoria), con caché de uv y npm.

**Descartado:** un disparador de Cloud Build. Conectar Cloud Build con GitHub exige un paso manual de OAuth en la consola, y las pruebas no necesitan nada de Google Cloud.

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

El criterio es ≥ 9 de 10 por modo y cada ejecución < 120 s, del encargo al pedido confirmado. Las otras dos series completas de ese día también dieron 10/10 en los dos modos:

- 14:53: promedio de 44.9 s y 23.8 s.
- 16:21: promedio de 32.1 s y 40.3 s; el máximo fue 110.6 s, el caso que motivó las llamadas cubiertas.

Serie de liberación, 2026-10-01, con las protecciones de escenario (token de escenario, tiendas fijas en el servidor y barajadas, revisión determinista del checkout) y con Gemini más lento ese día: Kilómetro **9/10** con el modo apagado (promedio 54.9 s; la ejecución restante se quedó sin tiempo a los 110 s y no compró nada) y Pulso **10/10** con el modo encendido (promedio 51.9 s, máximo 85.3 s). Todas las ejecuciones terminaron en menos de 120 s y las 19 compras se firmaron con passkey.

Serie fallida, 2026-10-01 (01:38): Kilómetro **7/10** con el modo apagado y Pulso **8/10** con el modo encendido; las otras 5 ejecuciones terminaron en `failed` sin elegir tienda (entre 82 y 111 s) y el JSON no guarda la causa.

En los 7 reportes de `bias-results/` (104 ejecuciones, 52 por modo, incluidas dos pruebas de 1 ejecución por modo) el agente eligió la tienda esperada 98 veces y nunca eligió la otra tienda; las 6 restantes fueron ejecuciones `failed` sin compra: 2 llegaron al tope de 110 s y 4 terminaron antes (82–91 s), así que no todas fueron por tiempo.

Los reportes JSON quedan en `bias-results/` (local, fuera de git).
