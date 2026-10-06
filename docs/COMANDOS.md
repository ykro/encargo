# Comandos

Todos los comandos del `Makefile`. `make help` los lista con su descripción. Volver al [README](../README.md). [English version](COMANDOS.en.md).

Variables: `TARGET=local|cloud` (por omisión `local`), `URL` (por omisión `http://localhost:3001`) y `RUNS` (por omisión `10`).

Día de la charla, en este orden: `make stage-on` → `make preflight` → `make warmup TARGET=cloud` → `make reset TARGET=cloud`; al terminar, `make stage-off`. Detalle en [DEMO.md](DEMO.md).

| Comando | Qué hace |
| --- | --- |
| `make help` | Lista los comandos con su descripción. |
| `make up` | Arranca en local la app (3000), Kilómetro (3001), Pulso (3002) y el agente (8000). Los logs quedan en `.data/logs/`. Ctrl-C detiene todo. |
| `make reset` | Vuelve al estado inicial: stock sembrado, sin carritos, checkouts ni pedidos, Pulso opaco y sin ejecuciones, eventos, mandatos ni capturas. Las passkeys se conservan. Espera cada llamada y falla (con el servicio que no respondió) si alguna falla; solo entonces imprime `reset ok`. `TARGET=cloud` reinicia los servicios de Cloud Run. |
| `make test` | Kit de comercio (vitest), typecheck de las tiendas y de la app, agente (pytest con `MOCK_AI=1`, Firestore en memoria, sin navegador). |
| `make e2e` | Flujo de passkey en Chrome con el autenticador virtual de DevTools: registra → envía el encargo → firma el mandato → pedido confirmado. Borra la credencial al final. |
| `make e2e-emulator` | Lado del teléfono en el emulador Android (`Pixel_9_API_36_1`; si tiene PIN, lo desbloquea con `EMULATOR_PIN`, 1234 por defecto): encargo, progreso, tarjeta de aprobación y cancelación. Guarda capturas en `docs/screenshots/emulator/`. Por defecto va contra Cloud Run (el emulador no ve el `localhost` del portátil); con `TARGET=local` mapea el puerto 3000 con `adb reverse`. |
| `make bias-test` | 10 ejecuciones con el modo de control apagado (espera Kilómetro) y 10 con el modo encendido (espera Pulso). Cada ejecución va del encargo a la firma con passkey y al pedido. Escribe el reporte en `bias-results/`. |
| `make audit URL=…` | Checklist de preparación para agentes de cualquier tienda. |
| `make phone` | Abre el «teléfono» que firma: una ventana de Chrome de 390×844 en modo app, con la passkey del Mac (Touch ID). |
| `make stage-on` / `make stage-off` | Día de la charla: una instancia mínima en los cuatro servicios / el resto del tiempo: 0 (nada se cobra las 24 horas). |
| `make warmup` | Despierta cada servicio, hace una llamada corta a Gemini y arranca Chromium en el agente. Con `TARGET=cloud`, después de `stage-on` y `preflight` (las correcciones de `preflight` reemplazan las instancias). |
| `make record-replay` | Graba una ejecución real en la nube (eventos y capturas) como plan B en `app/public/replays/`. |
| `make preflight` | Portero del día de la charla: falla si algún servicio no está sano, no hay passkey, el modo de control está encendido, falta `min-instances=1`, alguna grabación ya no coincide con el catálogo y el encargo (o la app desplegada sirve otra copia) o queda poco stock de la talla 9. |
| `make up-offline` / `make e2e-offline` | Plan B sin internet: la app y las grabaciones desde el portátil / la prueba con la red cortada (`VIDEO=1` regenera el MP4). |
| `make control-on` / `make control-off` | Enciende o apaga el modo de control al vuelo (`TARGET=cloud` en la nube). |
| `make demo-screens` | Captura `docs/demo/` desde dos ejecuciones reales en la nube (guion de la demo). |
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

- Abre `http://localhost:3000/configurar?clave=dev-admin` y registra una passkey (Touch ID). En la nube, ese mismo enlace (con el `ADMIN_TOKEN` real) también habilita el dispositivo para enviar encargos.
- Envía el encargo desde `http://localhost:3000` y míralo en `http://localhost:3000/presenter`.
- `make test` corre todas las pruebas sin red.

Los detalles (requisitos, nube, ensayo y día de la charla) están en [ONBOARDING.md](ONBOARDING.md).
