# Fuentes de datos

Todos los datos de Encargo son sintéticos; no hay datos de la web ni personales.

| Dato | Origen | Cómo se genera |
| --- | --- | --- |
| `catalog/catalog.json` — 10 modelos de la marca ficticia "Senda" (trail y ruta), tallas, stock, precios por tienda, tiempos de entrega | `synthetic` (`catalog/seed.py`, semilla 2027) | `make seed` (determinista). Cada registro lleva `origin`. |
| `catalog/images/<modelo>.jpg` — foto de estudio sin texto ni logos | `synthetic` (`IMAGE_MODEL`, prompt e intento en `<modelo>.prompt.json`) | `make images`; verificado con `GEMINI_MODEL` (sin texto ni marcas). |
| `catalog/images/pulso/<modelo>.jpg` — anuncio con nombre y precio de Pulso dentro de la imagen | `synthetic` (`IMAGE_MODEL`, prompt en `<modelo>.prompt.json`) | `make images`; OCR con `GEMINI_MODEL` exige nombre y precio exactos. |
| Estado de las tiendas (stock, carritos, checkouts, pedidos) | `synthetic` | SQLite sembrado desde el catálogo; «Empezar de nuevo» en el presentador lo restaura. |
| Estado de los encargos (runs, events, mandates, orders) | `synthetic` (generado en cada demo) | Firestore, base `encargo`; «Empezar de nuevo» en el presentador lo borra. |
