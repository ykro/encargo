# Versiones de protocolos y dependencias

Verificado el 2026-09-30 contra la documentación y los repositorios oficiales.

## Protocolos (preview)

| Protocolo | Versión usada | Fuente | Qué se implementa |
| --- | --- | --- | --- |
| Universal Commerce Protocol (UCP) | `2026-08-25` (rama `release/2026-08-25`, la última publicada) | [ucp.dev](https://ucp.dev), [github.com/Universal-Commerce-Protocol/ucp](https://github.com/Universal-Commerce-Protocol/ucp) | Perfil de negocio en `/.well-known/ucp` (servicio `dev.ucp.shopping`, transporte REST, `keys[]` JWK); capacidades `catalog.search`, `catalog.lookup`, `cart`, `checkout`, extensiones `fulfillment` y `dev.ucp.common.payment.ap2_mandate`. Endpoints: `POST /catalog/search`, `POST /catalog/lookup`, `POST/GET/PUT /carts[/{id}]`, `POST /carts/{id}/cancel`, `POST/GET/PUT /checkout-sessions[/{id}]`, `POST /checkout-sessions/{id}/complete`, `POST /checkout-sessions/{id}/cancel`. Montos en centavos. Encabezado `UCP-Agent: profile="…"`. No hay SDK oficial para TypeScript: el perfil y los endpoints se implementan desde la especificación (`stores/shared/src/ucp/`). |
| Agent Payments Protocol (AP2) | `v0.2` (CHANGELOG 0.2.0, 2026-04-28) | [ap2-protocol.org](https://ap2-protocol.org), [github.com/google-agentic-commerce/AP2](https://github.com/google-agentic-commerce/AP2) | Mandato de checkout cerrado (`vct: "mandate.checkout.1"`, `checkout_jwt` + `checkout_hash`) como SD-JWT firmado ES256, en el modelo "trusted platform provider" de la extensión AP2 Mandates de UCP. La tienda firma cada checkout (`ap2.merchant_authorization`, JWS desacoplado sobre JCS/RFC 8785) y rechaza `complete` sin un mandato válido. El formato se implementa directamente (TypeScript: `stores/shared/src/ap2/`, Python: `agent/encargo/ap2/`); no se usa la cadena de delegación abierta→cerrada del SDK de AP2 ni el mandato de pago (los pagos son sandbox). |
| schema.org | versión actual (Product, ProductGroup, Offer, OfferShippingDetails, ShippingDeliveryTime) | [schema.org](https://schema.org) | JSON-LD en cada página de producto de Kilómetro (y de Pulso en modo de control). |
| Google Merchant Center feed | RSS 2.0 + espacio de nombres `g:` | [Product data specification](https://support.google.com/merchants/answer/7052112) | `/feed.xml`: un `item` por talla con `item_group_id`, `price`, `availability`, `size`, `min/max_handling_time` y `g:shipping` con `min/max_transit_time`. |
| WebAuthn (passkeys) | Level 3 | [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/) | La persona aprueba cada pago con una passkey (verificación de usuario obligatoria). El desafío se deriva del checkout firmado por la tienda: `sha256(checkout_hash + "." + nonce)`. Servidor: `webauthn` (py_webauthn) en `agent/encargo/passkey.py`; navegador: `@simplewebauthn/browser` en la app. En la nube solo una aserción de passkey aprueba (`SIGNER_MODE=passkey`); el firmador de prueba con token existe solo con `SIGNER_MODE=test`. |

## Dependencias principales

| Componente | Paquete | Versión |
| --- | --- | --- |
| Agente | Python | 3.13 (uv 0.8) |
| Agente | google-adk | 2.10.0 |
| Agente | google-genai | 2.25.0 |
| Agente | playwright (Chromium headless) | 1.63.0 |
| Agente | google-cloud-firestore | 2.33.0 |
| Agente | fastapi | 0.141.1 |
| Agente | webauthn (py_webauthn) | 3.0.1 |
| Tiendas | Node.js | 24 (SQLite con `node:sqlite`) |
| Tiendas | next | 16.3.8 (App Router) |
| Tiendas | react | 19.3.0 |
| Tiendas | jose | 6.2.12 |
| App | @simplewebauthn/browser | ^14.0.0 |

Modelos: siempre desde variables de entorno (`GEMINI_MODEL`, `IMAGE_MODEL`), ver `.env.example`.
