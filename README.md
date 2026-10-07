# Encargo — la carrera de los tenis

Demo de la charla **«Tu próximo cliente es un agente de IA»**. Encargo es un agente que compra por una persona: «Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes». Hay dos tiendas ficticias con los mismos tenis. **Pulso** es más barata (139 USD), pero solo la lee una persona: los datos están en fotos y en un `canvas`. **Kilómetro** cuesta 145 USD, pero está lista para agentes (schema.org, feed, UCP y AP2). Encargo compra en Kilómetro porque es la única donde puede verificar todo. Con el modo de control encendido, Pulso publica los mismos datos y Encargo compra ahí, porque es más barata.

[English version](README.en.md)

## Qué vas a aprender

1. **Los agentes leen datos, no marketing:** un dato que solo está en una imagen no cuenta.
2. **El embudo colapsa:** siete pantallas para una persona, tres pasos para el agente.
3. **El modo de control demuestra que el agente no tiene sesgo:** con los mismos datos, compra donde es más barato.
4. **Confianza:** el agente arma el carrito, pero solo una passkey firma el mandato AP2 que paga.
5. **El checklist práctico:** `make audit` califica cualquier tienda en ocho puntos.

![Arquitectura de Encargo](docs/diagrams/architecture.png)

![Qué se prueba en la demo](docs/diagrams/que-se-prueba.png)

## El día de la charla

No se corre ningún comando. Se abren dos páginas en el mismo Chrome del portátil:

- **Presentador** (vista del proyector, solo para la demo en vivo), en el proyector: https://encargo-app-611681112050.us-central1.run.app/presentador. Al abrirse despierta las tiendas, el agente y Gemini, y si llevaba rato sin uso empieza de cero. Dice «Preparando la demo…» y, en unos 15–20 s, «Envía un encargo desde la app». Ahí están el interruptor del modo de control, «Empezar de nuevo» y «Ver la ejecución grabada» (el plan B).
- **Teléfono**, en la pantalla del portátil: https://encargo-app-611681112050.us-central1.run.app. Se envía el encargo y se firma con Touch ID.

El guion completo está en [docs/DEMO.md](docs/DEMO.md).

## Arranque rápido (desarrollo)

```bash
cp .env.example .env                       # modelos, URLs locales y tokens de desarrollo
gcloud auth application-default login      # ADC para Gemini en Vertex AI (o MOCK_AI=1 en .env)
(cd agent && uv run playwright install chromium)
make up                                    # app :3000, Kilómetro :3001, Pulso :3002, agente :8000
open "http://localhost:3000/configurar?clave=dev-admin"   # registra una passkey (Touch ID)
open http://localhost:3000/presentador     # envía el encargo desde http://localhost:3000
make test                                  # todas las pruebas, sin red
```

**Prueba de sesgo** (`make bias-test TARGET=cloud`, 2026-10-01): Kilómetro 9/10 con el modo apagado y Pulso 10/10 con el modo encendido, todas las ejecuciones en menos de 120 s ([detalle](docs/DECISIONES.md#resultados-de-la-prueba-de-sesgo)).

## Páginas desplegadas

**El producto, lo que cualquiera puede probar** (en el teléfono, la tablet o la computadora):

| Página | URL | Qué es |
| --- | --- | --- |
| App Encargo | https://encargo-app-611681112050.us-central1.run.app | Escribes el encargo, ves cómo decide el agente y firmas la compra con tu passkey |
| Auditoría | https://encargo-app-611681112050.us-central1.run.app/auditoria | Pega la dirección de una tienda y ve qué tan lista está para agentes |
| Kilómetro | https://encargo-kilometro-611681112050.us-central1.run.app | Tienda ficticia lista para agentes |
| Pulso | https://encargo-pulso-611681112050.us-central1.run.app | Tienda ficticia opaca para agentes |

Todas se adaptan al teléfono y a la tablet. En un teléfono de 375 px: la app, un encargo en curso, la auditoría, Kilómetro, Pulso y el presentador.

![Encargo en el teléfono](docs/demo/movil.png)

**Solo para la demo en vivo:**

| Página | URL | Qué es |
| --- | --- | --- |
| Presentador | https://encargo-app-611681112050.us-central1.run.app/presentador | La vista del proyector: muestra en grande lo que ve una persona, el razonamiento del agente y lo que ve el agente. Prepara los servicios al abrirse y tiene los botones de la charla. No es parte del producto |

El agente no tiene página: es un servicio (https://encargo-agent-611681112050.us-central1.run.app, con `/health` y `/.well-known/ucp`). La dirección vieja `/presenter` lleva al presentador.

## Documentación

- [docs/DEMO.md](docs/DEMO.md): guion de la demo, con capturas, qué decir, tiempos y qué hacer si algo falla.
- [docs/ONBOARDING.md](docs/ONBOARDING.md): instalación, nube, pruebas, recorrido del código, solución de problemas y checklist del día.
- [docs/DECISIONES.md](docs/DECISIONES.md): lo que enseña la demo en detalle, cada decisión técnica, versiones de UCP y AP2, y resultados de la prueba de sesgo.
- [docs/COMANDOS.md](docs/COMANDOS.md): todos los comandos `make`.
- [docs/ESTRUCTURA.md](docs/ESTRUCTURA.md): componentes, servicios y mapa del repositorio.
- [docs/CREDITOS.md](docs/CREDITOS.md): procedencia de las imágenes y los datos.
- [VERSIONS.md](VERSIONS.md): versiones de los protocolos y las dependencias.
- [docs/diagrams/](docs/diagrams/): arquitectura, qué se prueba, secuencia de una compra, matriz de lectura y embudo (HTML, SVG y PNG).
- [data/SOURCES.md](data/SOURCES.md) y [data/DATASHEET.md](data/DATASHEET.md): datos sintéticos.

## Usar tu propio proyecto de Google Cloud

Los scripts de `infra/` usan `PROJECT_ID` (por defecto el proyecto de la charla). Para desplegar en el tuyo,
corre `PROJECT_ID=<tu-proyecto> make deploy` y pon el mismo ID en `.env`. El detalle está en la
[guía de incorporación](docs/ONBOARDING.md).

## Licencia

Código bajo [Apache 2.0](LICENSE). Las imágenes del catálogo son sintéticas y la marca, las tiendas y los
datos son ficticios ([NOTICE](NOTICE), [créditos](docs/CREDITOS.md)).
