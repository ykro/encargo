# Encargo — la carrera de los tenis

Demo de la charla **«Tu próximo cliente es un agente de IA»**. Encargo es un agente que compra por una persona. Recibe un encargo («tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes») y dos tiendas ficticias que venden los mismos tenis:

- **Pulso**: espectacular y más barata (139 USD), pero solo legible para humanos. El precio y el nombre están dentro de las imágenes, las tallas en un selector dibujado y la entrega aparece solo al final del pago.
- **Kilómetro**: sobria y más cara (145 USD), pero lista para agentes: schema.org, feed de Merchant Center, perfil UCP y checkout que exige un mandato AP2.

Encargo compra en Kilómetro porque es la única tienda donde puede verificar cada condición. Con el modo de control (`PULSO_AGENT_READY=true`), Pulso publica los mismos datos y Encargo compra ahí, porque es más barata: el agente no tiene sesgo, solo usa lo que puede comprobar.

## Qué vas a aprender

- Qué ve un agente de una tienda (datos, no marketing) y por qué un checklist «cumple / no cumple / no verificable» decide la compra.
- Cómo se publica una tienda para agentes: JSON-LD de schema.org, feed de Merchant Center, perfil UCP (`/.well-known/ucp`) con catálogo, carrito y checkout.
- Cómo se autoriza un pago sin darle la tarjeta al agente: la tienda firma el checkout y la persona firma un mandato AP2 con su passkey.

## Arranque rápido

```bash
cp .env.example .env        # modelos y tokens locales
make up                     # app :3000, Kilómetro :3001, Pulso :3002, agente :8000
make test                   # vitest + typecheck + pytest (MOCK_AI)
make e2e                    # flujo de passkey en Chrome con autenticador virtual
make bias-test TARGET=cloud # 10 + 10 corridas contra Cloud Run
make audit URL=https://tu-tienda.example
```

Comandos: `make up`, `reset`, `test`, `e2e`, `e2e-emulator`, `phone`, `screens`, `bias-test`, `audit`, `images`, `seed`, `deploy` (`make help` los describe).

## Quién firma (decisión técnica)

El mandato AP2 se firma con una **passkey** (WebAuthn). El desafío que firma la passkey se deriva del checkout que firmó la tienda (`sha256(checkout_hash + "." + nonce)`), así que la firma aprueba exactamente ese carrito.

**En el escenario, el dispositivo que firma es el portátil, en una ventana del tamaño de un teléfono** (`make phone TARGET=cloud`: Chrome en modo app, 390×844), con el autenticador del Mac (Touch ID).

- **Por qué no el teléfono:** la charla no usa un teléfono real; el «teléfono» es el emulador Android `emulator-5556`. Ahí Chrome no tiene un proveedor de credenciales sin iniciar sesión con una cuenta de Google, así que solo ofrece «crear la passkey en otro dispositivo» (QR híbrido). Además, Chrome para Android no expone el autenticador virtual de DevTools. Iniciar sesión con una cuenta de Google en el emulador queda descartado.
- **Qué sí se prueba en el emulador:** `make e2e-emulator` envía el encargo desde Chrome del emulador, sigue la corrida, muestra la tarjeta de aprobación y cancela. También registra la hoja nativa de passkey que ofrece Chrome. Las capturas quedan en `docs/screenshots/emulator/`.
- **Ensayos y pruebas automáticas:** `make e2e` registra una passkey, envía el encargo y firma el mandato. Lo hace en Chrome con el autenticador virtual de DevTools (passkey de plataforma con verificación de usuario). `make bias-test` firma con un autenticador de software (`agent/encargo/software_authenticator.py`) por el mismo camino WebAuthn. Ambos borran su credencial al terminar.
- **Registro:** `/configurar?clave=<ADMIN_TOKEN>` registra la passkey del dispositivo que firma. Sin el código de configuración nadie del público puede registrar un dispositivo. En la nube, el agente corre con `SIGNER_MODE=passkey`: el token del firmador de prueba solo existe en modo `test` (pruebas locales).

## Dónde corre cada parte

| Componente | Dónde | Por qué |
| --- | --- | --- |
| Pulso, Kilómetro (`stores/`) | Cloud Run, 1 instancia | Estado en SQLite dentro del proceso; `make reset` lo restaura |
| Agente (`agent/`) | Cloud Run, CPU siempre activa, 1 instancia | Las corridas siguen después de responder `POST /runs`; el estado está en Firestore (`encargo`) |
| App (`app/`) | Cloud Run | Su dominio `run.app` es el RP ID de las passkeys |
| Firma del mandato | Portátil (ventana de teléfono, Touch ID) | Ver «Quién firma» |

Versiones de UCP, AP2 y dependencias: [VERSIONS.md](VERSIONS.md). Datos: [data/SOURCES.md](data/SOURCES.md), [data/DATASHEET.md](data/DATASHEET.md).
