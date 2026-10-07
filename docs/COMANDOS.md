# Comandos

Todos los comandos del `Makefile`. `make help` los lista con su descripción. Volver al [README](../README.md). [English version](COMANDOS.en.md).

Variables: `TARGET=local|cloud` (por omisión `local`), `URL` (por omisión `http://localhost:3001`) y `RUNS` (por omisión `10`).

El día de la charla no se corre ningún comando: se abren las páginas y la página del presentador despierta y revisa todo sola ([DEMO.md](DEMO.md)). Estos comandos son para desarrollar, probar y desplegar.

| Comando | Qué hace |
| --- | --- |
| `make help` | Lista los comandos con su descripción. |
| `make up` | Arranca en local la app (3000), Kilómetro (3001), Pulso (3002) y el agente (8000). Los logs quedan en `.data/logs/`. Ctrl-C detiene todo. |
| `make reset` | Desarrollo: vuelve al estado inicial (en el escenario lo hace el botón «Empezar de nuevo» del presentador): stock sembrado, sin carritos, checkouts ni pedidos, Pulso opaco y sin ejecuciones, eventos, mandatos ni capturas. Las passkeys se conservan. Espera cada llamada y falla (con el servicio que no respondió) si alguna falla; solo entonces imprime `reset ok`. `TARGET=cloud` reinicia los servicios de Cloud Run. |
| `make test` | Kit de comercio (vitest), typecheck de las tiendas y de la app, agente (pytest con `MOCK_AI=1`, Firestore en memoria, sin navegador). |
| `make e2e` | Flujo de passkey en Chrome con el autenticador virtual de DevTools: registra → envía el encargo → firma el mandato → pedido confirmado. Borra la credencial al final. |
| `make e2e-emulator` | Lado del teléfono en el emulador Android (`Pixel_9_API_36_1`; si tiene PIN, lo desbloquea con `EMULATOR_PIN`, 1234 por defecto): encargo, progreso, tarjeta de aprobación y cancelación. Guarda capturas en `docs/screenshots/emulator/`. Por defecto va contra Cloud Run (el emulador no ve el `localhost` del portátil); con `TARGET=local` mapea el puerto 3000 con `adb reverse`. |
| `make bias-test` | 10 ejecuciones con el modo de control apagado (espera Kilómetro) y 10 con el modo encendido (espera Pulso). Cada ejecución va del encargo a la firma con passkey y al pedido. Escribe el reporte en `bias-results/`. |
| `make audit URL=…` | Checklist de preparación para agentes de cualquier tienda. |
| `make record-replay` | Graba una ejecución real en la nube (eventos y capturas) como plan B en `app/public/replays/`. Después, `./infra/50-deploy-app.sh`; `make test` falla si una grabación ya no coincide con el catálogo y el encargo. |
| `make plan-b-video` | Plan B en Cloud Run desde el botón «Ver la ejecución grabada» del presentador: el teléfono lo sigue y firma con una passkey virtual. `VIDEO=1` regenera `docs/plan-b-replay.mp4`. |
| `make demo-screens` | La demo completa en Cloud Run, solo con clics y como la hace el presentador (mejor desde un arranque en frío), y guarda `docs/demo/`. |
| `make seed` | Regenera `catalog/catalog.json` (determinista, semilla 2027). |
| `make images` | Genera las fotos de producto y los anuncios de Pulso con `IMAGE_MODEL`, verificados con `GEMINI_MODEL`. |
| `make deploy` | Ejecuta `infra/10` a `infra/50`: APIs, secretos, tiendas, agente y app en Cloud Run. |

## Arranque rápido

```bash
cp .env.example .env                       # modelos, URLs locales y tokens de desarrollo
gcloud auth application-default login      # ADC para Gemini en Vertex AI (o MOCK_AI=1 en .env)
(cd agent && uv run playwright install chromium)
make up                                    # app :3000, Kilómetro :3001, Pulso :3002, agente :8000
```

- Abre `http://localhost:3000/configurar?clave=dev-admin` y registra una passkey (Touch ID). En la nube ya hay una registrada; un navegador nuevo se habilita en el teléfono con «Habilitar con Touch ID».
- Envía el encargo desde `http://localhost:3000` y míralo en `http://localhost:3000/presentador`.
- `make test` corre todas las pruebas sin red.

Los detalles (requisitos, nube, ensayo y día de la charla) están en [ONBOARDING.md](ONBOARDING.md).
