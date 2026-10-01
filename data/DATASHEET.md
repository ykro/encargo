# Datasheet — catálogo de Encargo

**Propósito.** Dar a las dos tiendas de la demo (Pulso y Kilómetro) el mismo catálogo, para que la única diferencia entre ellas sea cómo lo publican.

**Composición.** 10 modelos de la marca ficticia "Senda": 5 de trail y 5 de ruta, tallas US 7–12 (un modelo solo 7–8.5). Por tienda: precio en USD, stock por talla, envío (gratis) y tiempo de entrega en días hábiles (preparación + tránsito). Ningún nombre, marca o producto es real.

**El modelo del encargo.** "Senda Acatenango T3": trail, talla 9 en stock en ambas tiendas, 139 USD en Pulso y 145 USD en Kilómetro, entrega en 0 + 1 días hábiles en ambas. Los demás modelos fallan cada uno en una condición distinta (precio, talla agotada, talla no ofrecida, entrega tardía, ruta en lugar de trail), para que la lista de verificación tenga algo que decir.

**Regla de "antes del viernes".** Las fechas no se guardan: se calculan desde la fecha de la corrida (hora de Guatemala, UTC-6).
- Plazo = el primer viernes estrictamente posterior a la fecha de la corrida; entregar ese viernes cuenta como a tiempo.
- Llegada = fecha de la corrida + máximo de preparación + máximo de tránsito, en días hábiles (lunes a viernes).
- El modelo del encargo (1 día hábil) siempre llega a tiempo (peor caso: corrida en jueves, llega el viernes). "Senda Fuego Tormenta" (7–10 días hábiles) nunca llega: el plazo está a lo sumo a 5 días hábiles.

**Generación.** `catalog/seed.py` con semilla 2027; stock de las tallas distintas de la 9 elegido al azar con esa semilla. Imágenes con `scripts/generate_product_images.py` (prompts junto a cada imagen).

**Limitaciones.** Datos de juguete para una charla; precios e inventarios no representan ningún mercado.
