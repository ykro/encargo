# Credits and provenance

Where Encargo's images and data come from. Back to the [README](../README.en.md). [Versión en español](CREDITOS.md).

## Image provenance

- Every photo is **generated** with `IMAGE_MODEL` (Nano Banana 2 Lite on Vertex AI) by `scripts/generate_product_images.py` (`make images`).
- **The prompt sits next to each image.** Every `catalog/images/<model>.jpg` has its `<model>.prompt.json`, with the model, the prompt, the attempt, the verification result and the `origin` (`synthetic`).
- **There are no real brands.** "Senda" is a fictional brand. Studio photos must come out with no text or logos, and `GEMINI_MODEL` checks that as a visual judge: if the check fails, the image is regenerated.
- Pulso's ads (`catalog/images/pulso/`) are edits of those photos with the name and price painted in. An OCR check with `GEMINI_MODEL` requires the text to be exact.
- The brand logos are in `app/public/brand/` and `stores/*/public/brand/`.

All data is synthetic: see [data/SOURCES.md](../data/SOURCES.md) and [data/DATASHEET.md](../data/DATASHEET.md).
