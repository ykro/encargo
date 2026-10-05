# Guion de la demo — Encargo

Plan paso a paso para la demo en vivo de **«Tu próximo cliente es un agente de IA»**. Cada paso es una pantalla, con lo que haces, lo que dices y lo que tarda.

Las capturas de `docs/demo/` salen de una ejecución real en Cloud Run (`make demo-screens`). Esa ejecución firma con el **autenticador virtual de Chrome**, que recorre las mismas pantallas y la misma ruta WebAuthn que Touch ID. Lo único que no aparece es el diálogo del sistema de macOS: la automatización no puede mostrarlo. En el escenario firmas con la passkey `adrian-macbook` (Touch ID).

![Qué se prueba en la demo](diagrams/que-se-prueba.png)

Cada bloque del diagrama dice qué pasos de este guion lo ejercitan («PASOS N») y qué se verifica ahí.

## Antes de la demo

### Checklist (una hora antes, con internet)

```bash
make stage-on            # una instancia tibia de cada servicio (sin arranques en frío)
make preflight           # portero del día, siempre contra Cloud Run: debe terminar en «preflight ok»
make warmup TARGET=cloud # despierta servicios, una llamada a Gemini y Chromium → «warmup ok»
make reset TARGET=cloud  # stock completo, sin pedidos ni ejecuciones, control apagado → «reset ok»
```

El orden importa. `preflight` necesita `stage-on`, porque revisa `min-instances=1`. `warmup` va después de `preflight`: las correcciones de `preflight` (`make stage-on`, volver a desplegar la app) crean una revisión nueva y reemplazan las instancias, y con eso se pierde lo que calentó `warmup`.

`make preflight` falla, con una línea en español por problema, si:

- algún servicio no está sano;
- no hay passkey registrada;
- el modo de control está encendido;
- falta `min-instances=1`;
- las grabaciones del plan B tienen más de 7 días;
- queda poco stock de la talla 9.

Corrige lo que diga y vuelve a correrlo.

### Ventanas

| Ventana | Cómo abrirla | Dónde va |
| --- | --- | --- |
| Presentador | Chrome en pantalla completa en `https://encargo-app-611681112050.us-central1.run.app/presenter` | Proyector, 1920×1080 |
| «Teléfono» | `make phone TARGET=cloud`: Chrome en modo app, 390×844, con la passkey del Mac | Pantalla del portátil, a un lado; la ves tú, el público ve el presentador |
| Auditoría (para el cierre) | Una pestaña en `…/auditoria` | Detrás del presentador; la traes al proyector en el paso 10 |

Las dos ventanas deben ser del mismo perfil de Chrome: ahí vive la passkey y ahí se coordina el plan B. Si la ventana del «teléfono» nunca abrió el enlace de configuración, ábrelo una vez: `/configurar?clave=<ADMIN_TOKEN>`. Así queda habilitada para enviar encargos.

## Durante la demo

### 1. El escenario listo · 0 s

![Presentador sin encargo](demo/01-presentador-listo.png)

**Haz:** nada. El presentador muestra «Esperando un encargo…», «Modo de control · APAGADO» y las tres columnas vacías.

**Di:** «Dos tiendas venden los mismos tenis. Una es preciosa y más barata; la otra es sosa. Veamos a quién le compra un agente.»

### 2. El encargo en el teléfono · 10 s

![Encargo escrito en el teléfono](demo/02-telefono-encargo.png)

**Haz:** en la ventana del «teléfono», escribe (o deja) el encargo y pulsa **Enviar encargo**:

```text
Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes
```

**Di:** «Le hablo como a alguien de confianza. No le digo en qué tienda comprar.»

### 3. El razonamiento en vivo · 15–40 s

![El checklist se llena](demo/03-presentador-razonamiento.png)

**Haz:** señala las tres columnas mientras se llenan.

- **01 Lo que ve una persona:** las capturas de las dos portadas.
- **02 Razonamiento:** el checklist por tienda.
- **03 Lo que ve el agente:** los datos que extrajo.

Abajo, la franja del camino se llena: perfil/feed → carrito → mandato.

**Di:** «Los agentes leen tus datos, no tu marketing. Pulso es la más bonita, pero para el agente tiene 0 campos legibles: todo está "no verificable". Y mira la franja de abajo: la persona necesita siete pantallas; el agente, tres pasos.»

![El teléfono mientras revisa](demo/04-telefono-revisando.png)

En el «teléfono» se ve el mismo checklist, más pequeño.

### 4. La decisión · 25–45 s

![Decisión y espera de la firma](demo/05-presentador-esperando-firma.png)

**Haz:** espera la barra azul «Decisión: Kilómetro · 145 USD» y la tarjeta «Esperando tu firma con passkey».

**Di:** «Compra donde puede comprobar todo, aunque sea más cara. Pero no paga: me pide permiso.»

### 5. La firma con passkey · 5–10 s

![Autoriza la compra](demo/06-telefono-autoriza.png)

**Haz:** en el «teléfono», lee la tarjeta «Autoriza la compra»: producto, talla, tienda, entrega, total, «Firmado por la tienda: Sí, verificado» y «Oferta válida hasta». Pulsa **Firmar mandato con passkey**.

Chrome muestra su diálogo de passkey: «Usar una passkey para encargo-app-611681112050.us-central1.run.app» con la cuenta `adrian-macbook`. macOS pide **Touch ID**. Pon el dedo.

**Di:** «Confianza: el agente arma el carrito, la tienda firma los términos y yo firmo un mandato AP2 con mi huella. Sin mi firma, la tienda rechaza el pago.»

**Qué cambia en el presentador** (en este orden):

1. «Firmado · la tienda confirma el pago…»
2. «Pedido confirmado · Mandato AP2 firmado con passkey · <pedido> · <segundos>»
3. El reloj se pone verde.
4. El paso «mandato» de la franja se llena.

![Pedido confirmado en el teléfono](demo/07-telefono-confirmado.png)

![Pedido confirmado en el presentador](demo/08-presentador-pedido-confirmado.png)

**Tiempo total, del encargo al pedido:** en la captura, 29 s. En la última prueba de sesgo (2026-10-01) el promedio fue 52–55 s y el máximo 110 s; depende de Gemini ese día.

### 6. ¿Sesgo? El modo de control · 10 s

**Haz:** en una terminal del portátil (fuera del proyector):

```bash
make control-on TARGET=cloud
```

En unos 5 s, el encabezado del presentador cambia a «Modo de control · ENCENDIDO · Pulso legible para agentes».

**Di:** «¿Y si el agente simplemente prefiere a Kilómetro? Le doy a Pulso la misma capa de datos y repito el mismo encargo.»

### 7. El mismo encargo, otra decisión · 25–45 s

**Haz:** en el «teléfono», pulsa **Nuevo encargo** y envía el mismo texto:

```text
Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes
```

![Con el control encendido, espera la firma para Pulso](demo/09-presentador-esperando-firma.png)

Ahora las dos tiendas cumplen todo y la decisión es «Pulso · 139 USD». Firma con Touch ID como en el paso 5.

![Compra en Pulso](demo/10-presentador-control-pulso.png)

**Di:** «Sin sesgo: con los mismos datos, compra en la más barata. Lo probamos 10 + 10 veces: Kilómetro 9/10 con el control apagado, Pulso 10/10 con el control encendido.»

**Haz:** apágalo antes de seguir:

```bash
make control-off TARGET=cloud
```

### 8. Tu tienda: la auditoría con QR · 30 s

![Auditoría con QR](demo/11-auditoria-qr.png)

**Haz:** trae la pestaña `/auditoria` al proyector. El público escanea el QR para auditar su propia tienda desde el teléfono.

**Di:** «El checklist práctico: ocho cosas que un agente necesita leer. Escaneen el código y auditen su tienda.»

### 9. Pulso frente a Kilómetro, en el checklist · 20 s

**Haz:** pulsa **Probar con Pulso** y luego **Probar con Kilómetro**.

![Pulso 0/8](demo/12-auditoria-pulso.png)

![Kilómetro 8/8](demo/13-auditoria-kilometro.png)

**Di:** «Pulso: 0 de 8. Kilómetro: 8 de 8. Cada punto dice qué es, por qué lo necesita un agente y cómo arreglarlo. Se imprime o se descarga como checklist.»

## Si algo falla

| Síntoma | Qué hacer |
| --- | --- |
| El reloj se pone **ámbar a los 60 s** y aparece «R = repetición» | Pulsa **R** en el presentador. Se reproduce la ejecución grabada bajo la franja «REPETICIÓN GRABADA · no es en vivo» y se detiene en la tarjeta de aprobación hasta una firma real: Touch ID en la ventana del «teléfono» con `/?demo=1`, o la barra espaciadora. **L** vuelve a lo en vivo. |
| No hay internet en el lugar | `make up-offline` y abre `http://localhost:3000/presenter?demo=1` (proyector) y `http://localhost:3000/?demo=1` (ventana del «teléfono»). Funciona sin red. |
| Nada funciona en el portátil | Proyecta el video [`docs/plan-b-replay.mp4`](plan-b-replay.mp4) (1920×1080, una ejecución completa). |
| El botón «Firmar mandato con passkey» está deshabilitado («Aún no hay una passkey registrada…») | Abre `…/configurar?clave=<ADMIN_TOKEN>` en la ventana del «teléfono» y registra Touch ID. Toma 20 s. |
| «Este dispositivo todavía no puede enviar encargos» | Mismo enlace de configuración: habilita la ventana con el token de escenario. |
| Touch ID se cancela o se agota el tiempo | Vuelve a pulsar «Firmar mandato con passkey». |
| El presentador muestra una ejecución vieja, o el control quedó encendido | `make reset TARGET=cloud` (menos de 10 s) y vuelve a enviar el encargo. |
| «La tienda no completó el pago» o «El encargo se detuvo» | `make reset TARGET=cloud` y repite; si vuelve a pasar, R (plan B). |

![Plan B: repetición grabada](demo/14-plan-b-repeticion.png)

## Después de la demo

```bash
make reset TARGET=cloud   # stock completo, sin pedidos ni ejecuciones, control apagado
make stage-off            # los cuatro servicios vuelven a 0 instancias: nada se cobra las 24 horas
```

## Regenerar las capturas

```bash
make stage-on && make demo-screens && make stage-off
```

`make demo-screens` hace dos ejecuciones reales, la segunda con el modo de control encendido. Firma con el autenticador virtual (que borra al terminar), captura la auditoría y el plan B, y deja la nube reiniciada.
