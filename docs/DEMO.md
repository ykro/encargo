# Guion de la demo — Encargo

Guion de la demo en vivo de **«Tu próximo cliente es un agente de IA»**. Cada paso es una pantalla, con lo que haces, lo que dices y lo que tarda. El día de la charla no se corre ningún comando: solo se abren dos páginas y se hace clic. [English version](DEMO.en.md).

Las capturas de `docs/demo/` salen de la demo completa en Cloud Run, hecha solo con clics como la haces tú (`make demo-screens`). En esa ejecución firma el **autenticador virtual de Chrome**, que recorre las mismas pantallas y la misma ruta WebAuthn que Touch ID. Lo único que no aparece es el diálogo de macOS, que la automatización no puede mostrar. En el escenario firmas con la passkey `adrian-macbook` (Touch ID).

![Qué se prueba en la demo](diagrams/que-se-prueba.png)

Cada bloque del diagrama dice qué pasos de este guion lo ejercitan («PASOS N») y qué se verifica ahí.

## Antes de la demo

El **presentador** es una página solo para la demo en vivo: la vista del proyector. El producto que cualquiera puede probar es la app (el «teléfono»), la auditoría y las dos tiendas ([README](../README.md#páginas-desplegadas)).

Unos minutos antes, con internet, abre dos ventanas del mismo perfil de Chrome (ahí vive la passkey):

| Ventana | Dirección | Dónde va |
| --- | --- | --- |
| Presentador | `https://encargo-app-611681112050.us-central1.run.app/presentador`, en pantalla completa | Proyector, 1920×1080 |
| «Teléfono» | `https://encargo-app-611681112050.us-central1.run.app` | Pantalla del portátil, a un lado. La ves tú; el público ve el presentador |
| Auditoría (para el cierre) | `https://encargo-app-611681112050.us-central1.run.app/auditoria`, en otra pestaña | Detrás del presentador; la traes al proyector en el paso 8 |

![El presentador se prepara solo](demo/00-presentador-preparando.png)

Al abrirse, el presentador despierta las dos tiendas, el agente, Gemini y el navegador del agente. Si llevaba más de 10 minutos sin encargos, también empieza de cero: stock completo, sin pedidos ni encargos en pantalla y el modo de control apagado. Mientras tanto, la columna central dice «Preparando la demo…» con cada parte. En unos 15–20 s cambia a «Envía un encargo desde la app». Mientras la ventana siga abierta, mantiene despiertos los servicios.

Si la columna central muestra un aviso en ámbar, dice qué falta. Por ejemplo: «No hay una passkey registrada para firmar».

**El teléfono, la primera vez en ese Chrome:** si muestra «Habilitar con Touch ID», tócalo y pon el dedo. Queda habilitado ese navegador, y con él el presentador: ahí se envían encargos, se firma, se reinicia y se cambia el modo de control.

![Habilitar el teléfono con Touch ID](demo/01b-telefono-habilitar.png)

## Durante la demo

### 1. El escenario listo · 0 s

![Presentador listo](demo/01-presentador-listo.png)

**Haz:** nada. El presentador muestra «Esperando un encargo…», «Modo de control · APAGADO» y las tres columnas vacías.

**Di:** «Dos tiendas venden los mismos tenis. Una es preciosa y más barata; la otra es sosa. Veamos a quién le compra un agente.»

### 2. El encargo en el teléfono · 10 s

![Encargo escrito en el teléfono](demo/02-telefono-encargo.png)

**Haz:** en la ventana del «teléfono», deja el encargo que ya viene escrito (o escríbelo) y pulsa **Enviar encargo**:

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

**Haz:** en el «teléfono», lee la tarjeta «Autoriza la compra»: producto, talla, tienda, entrega, total, «Firmado por la tienda: Sí, verificado» y «Oferta válida hasta». Pulsa **Firmar mandato con passkey**. Chrome muestra su diálogo de passkey con la cuenta `adrian-macbook` y macOS pide **Touch ID**: pon el dedo.

**Di:** «Confianza: el agente arma el carrito, la tienda firma los términos y yo firmo un mandato AP2 con mi huella. Sin mi firma, la tienda rechaza el pago.»

**Qué cambia en el presentador**, en este orden:

1. «Firmado · la tienda confirma el pago…»
2. «Pedido confirmado · Mandato AP2 firmado con passkey · <pedido> · <segundos>»
3. El reloj se pone verde.
4. El paso «mandato» de la franja se llena.

![Pedido confirmado en el teléfono](demo/07-telefono-confirmado.png)

![Pedido confirmado en el presentador](demo/08-presentador-pedido-confirmado.png)

**Tiempo total, del encargo al pedido:** en la última prueba de sesgo (2026-10-01) el promedio fue 52–55 s y el máximo 110 s; depende de Gemini ese día.

### 6. ¿Sesgo? El modo de control · 5 s

**Haz:** en el presentador, haz clic en **Modo de control** (arriba, junto al reloj). Cambia a «ENCENDIDO · Pulso legible para agentes».

**Di:** «¿Y si el agente simplemente prefiere a Kilómetro? Le doy a Pulso la misma capa de datos y repito el mismo encargo.»

### 7. El mismo encargo, otra decisión · 25–45 s

**Haz:** en el «teléfono», pulsa **Nuevo encargo** y envía el mismo texto.

![Con el control encendido, espera la firma para Pulso](demo/09-presentador-esperando-firma.png)

Ahora las dos tiendas cumplen todo y la decisión es «Pulso · 139 USD». Firma con Touch ID como en el paso 5.

![Compra en Pulso](demo/10-presentador-control-pulso.png)

**Di:** «Sin sesgo: con los mismos datos, compra en la más barata. Lo probamos 10 + 10 veces: Kilómetro 9/10 con el control apagado, Pulso 10/10 con el control encendido.»

### 8. Tu tienda: la auditoría con QR · 30 s

![Auditoría con QR](demo/11-auditoria-qr.png)

**Haz:** trae la pestaña de la auditoría al proyector. El público escanea el QR para auditar su propia tienda desde su teléfono.

**Di:** «El checklist práctico: ocho cosas que un agente necesita leer. Escaneen el código y auditen su tienda.»

### 9. Pulso frente a Kilómetro, en el checklist · 20 s

**Haz:** pulsa **Probar con Pulso** y luego **Probar con Kilómetro**.

![Pulso 0/8](demo/12-auditoria-pulso.png)

![Kilómetro 8/8](demo/13-auditoria-kilometro.png)

**Di:** «Pulso: 0 de 8. Kilómetro: 8 de 8. Cada punto dice qué es, por qué lo necesita un agente y cómo arreglarlo. Se imprime o se descarga como checklist.»

## Si algo falla

| Síntoma | Qué hacer |
| --- | --- |
| La ejecución pasa de 60 s: el reloj y el botón «Ver la ejecución grabada» se ponen en ámbar | Haz clic en **Ver la ejecución grabada** (abajo a la derecha del presentador). Se reproduce una ejecución real grabada bajo la franja «REPETICIÓN GRABADA», con el día en que se grabó y «no es en vivo». El teléfono pasa solo a la misma grabación y se detiene en «Autoriza la compra»: firma con Touch ID como siempre. Si el teléfono no está abierto, usa **Continuar con firma simulada** en la franja (la pantalla lo dice). **Volver a lo en vivo** regresa los dos. |
| «El encargo se detuvo» o «La tienda no completó el pago» | **Ver la ejecución grabada**, o **Empezar de nuevo** y envía otra vez el encargo. |
| El presentador muestra una ejecución vieja, o el modo de control quedó encendido | **Empezar de nuevo** (abajo a la derecha): stock completo, sin pedidos, modo de control apagado. |
| El teléfono dice «Habilitar con Touch ID» | Tócalo y pon el dedo (20 s). |
| Touch ID se cancela o se agota el tiempo | Vuelve a pulsar «Firmar mandato con passkey». |
| La columna central sigue en «Preparando la demo…» más de un minuto | Revisa que haya internet en el portátil; la página reintenta sola. |
| No hay internet en el lugar | Proyecta el video [`docs/plan-b-replay.mp4`](plan-b-replay.mp4): una ejecución completa, 1920×1080. |

![Plan B: repetición grabada](demo/14-plan-b-repeticion.png)

## Después de la demo

Nada. Cierra las ventanas: Cloud Run apaga los servicios solo cuando dejan de recibir visitas, y la próxima vez que abras el presentador empieza de cero.
