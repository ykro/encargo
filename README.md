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

## Arranque rápido

```bash
cp .env.example .env                       # modelos, URLs locales y tokens de desarrollo
gcloud auth application-default login      # ADC para Gemini en Vertex AI (o MOCK_AI=1 en .env)
(cd agent && uv run playwright install chromium)
make up                                    # app :3000, Kilómetro :3001, Pulso :3002, agente :8000
open "http://localhost:3000/configurar?clave=dev-admin"   # registra una passkey (Touch ID)
open http://localhost:3000/presenter       # envía el encargo desde http://localhost:3000
make test                                  # todas las pruebas, sin red
```

**Prueba de sesgo** (`make bias-test TARGET=cloud`, 2026-10-01): Kilómetro 9/10 con el modo apagado y Pulso 10/10 con el modo encendido, todas las ejecuciones en menos de 120 s ([detalle](docs/DECISIONES.md#resultados-de-la-prueba-de-sesgo)).

## URLs desplegadas

| Servicio | URL |
| --- | --- |
| App (teléfono) | https://encargo-app-611681112050.us-central1.run.app |
| Presentador | https://encargo-app-611681112050.us-central1.run.app/presenter |
| Auditoría | https://encargo-app-611681112050.us-central1.run.app/auditoria |
| Kilómetro | https://encargo-kilometro-611681112050.us-central1.run.app |
| Pulso | https://encargo-pulso-611681112050.us-central1.run.app |
| Agente | https://encargo-agent-611681112050.us-central1.run.app (`/health`, `/.well-known/ucp`) |

Usa estas URL y no los alias `…-uc.a.run.app`: la passkey está ligada al host de la app (RP ID) y con otro host la firma falla.

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
