# Créditos y procedencia

De dónde salen las imágenes y los datos de Encargo. Volver al [README](../README.md). [English version](CREDITOS.en.md).

## Procedencia de las imágenes

- Todas las fotos son **generadas** con `IMAGE_MODEL` (Nano Banana 2 Lite vía Vertex AI) por `scripts/generate_product_images.py` (`make images`).
- **El prompt está junto a cada imagen.** Cada `catalog/images/<modelo>.jpg` tiene su `<modelo>.prompt.json`, con el modelo, el prompt, el intento, el resultado de la verificación y el `origin` (`synthetic`).
- **No hay marcas reales.** «Senda» es una marca ficticia. Las fotos de estudio deben salir sin texto ni logos, y `GEMINI_MODEL` lo verifica como juez visual: si falla, la imagen se regenera.
- Los anuncios de Pulso (`catalog/images/pulso/`) son ediciones de esas fotos con el nombre y el precio pintados. Un OCR con `GEMINI_MODEL` exige que el texto sea exacto.
- Los logos de las marcas están en `app/public/brand/` y `stores/*/public/brand/`.

Los datos son sintéticos: ver [data/SOURCES.md](../data/SOURCES.md) y [data/DATASHEET.md](../data/DATASHEET.md).
