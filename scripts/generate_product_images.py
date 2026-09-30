# /// script
# requires-python = ">=3.12"
# dependencies = ["google-genai>=1.63.0", "pillow>=11"]
# ///
"""Generate product photos for the fictional brand "Senda" with IMAGE_MODEL.

Two kinds of asset per model, read from catalog/catalog.json:

- catalog/images/<slug>.jpg — a clean studio photo. Kilómetro uses it as-is: the
  facts (name, price, sizes, delivery) live in text and structured data, so the
  photo must carry NO text or logos (image models love inventing real brands).
- catalog/images/pulso/<slug>.jpg — an ad-style edit of the same shoe with the
  model name and Pulso's price painted *inside the pixels*. That is what makes
  Pulso beautiful for humans and opaque for agents.

Every asset is checked with GEMINI_MODEL as a vision verifier (no text on base
photos; exact name + price legible on Pulso's) and retried with feedback.
The prompt, model and verification result are saved next to each asset as
<slug>.prompt.json (data origin rule: synthetic, with model + prompt + attempt).

Run:  IMAGE_MODEL=... GEMINI_MODEL=... uv run scripts/generate_product_images.py
Flags: --only <slug> (repeatable), --force (regenerate existing assets).
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
from pathlib import Path

from google import genai
from google.genai import errors, types
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "catalog" / "catalog.json"
IMAGES = ROOT / "catalog" / "images"
PULSO = IMAGES / "pulso"
MAX_WIDTH = 1200
MAX_ATTEMPTS = 4

COLORS_EN = {
    "Verde musgo con naranja": "moss green with orange accents",
    "Gris piedra con rojo": "stone grey with red accents",
    "Negro con amarillo": "black with yellow accents",
    "Rojo lava con negro": "lava red with black accents",
    "Azul lago con blanco": "lake blue with white accents",
    "Blanco con azul": "white with blue accents",
    "Coral con gris": "coral with grey accents",
    "Amarillo neón": "neon yellow",
    "Negro total": "all black",
    "Blanco con verde menta": "white with mint green accents",
}

CATEGORY_FEATURES = {
    "trail": "a trail running shoe with an aggressive lugged outsole, protective toe cap "
    "and rugged upper",
    "road": "a road running shoe with a smooth outsole, breathable engineered mesh upper "
    "and a sleek cushioned midsole",
}

STYLE = (
    "Professional e-commerce studio product photograph. A single shoe, right foot, "
    "clean side profile view facing left, centered, the whole shoe visible with margin. "
    "Seamless very light warm-grey background, soft even studio lighting, subtle soft "
    "shadow under the sole, sharp focus, photorealistic, 4:3 landscape framing."
)

NO_TEXT = (
    "ABSOLUTELY NO text, NO letters, NO numbers, NO words, NO logos, NO brand marks, "
    "NO emblems or symbols anywhere on the shoe, the sole, the tongue, the heel or the "
    "background. All surfaces are plain, unbranded material."
)


def env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Missing env var {name} (see .env.example)")
    return value


def with_backoff(call, what: str, tries: int = 8):
    """Vertex returns 429 RESOURCE_EXHAUSTED in bursts on this project."""
    delay = 10.0
    for attempt in range(tries):
        try:
            return call()
        except errors.APIError as exc:
            if exc.code in (429, 500, 503) and attempt < tries - 1:
                print(f"  {what}: {exc.code}, retrying in {delay:.0f}s", flush=True)
                time.sleep(delay)
                delay = min(delay * 2, 60)
                continue
            raise


def first_image(response) -> bytes | None:
    for candidate in response.candidates or []:
        for part in (candidate.content.parts if candidate.content else None) or []:
            if part.inline_data and part.inline_data.data:
                return part.inline_data.data
    return None


def to_jpeg(data: bytes, max_width: int = MAX_WIDTH) -> bytes:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    if img.width > max_width:
        img = img.resize((max_width, round(img.height * max_width / img.width)), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85, optimize=True, progressive=True)
    return out.getvalue()


def ask_json(client, model: str, image: bytes, question: str) -> dict:
    response = with_backoff(
        lambda: client.models.generate_content(
            model=model,
            contents=[types.Part.from_bytes(data=image, mime_type="image/jpeg"), question],
            config=types.GenerateContentConfig(
                response_mime_type="application/json", temperature=0
            ),
        ),
        "verify",
    )
    return json.loads(response.text)


def base_prompt(m: dict) -> str:
    color = COLORS_EN.get(m["color_es"], m["color_es"])
    return (
        f"{STYLE} The shoe is {CATEGORY_FEATURES[m['category']]}, colorway {color}. "
        f"{NO_TEXT}"
    )


def typography(m: dict, price: str) -> str:
    return (
        "Render exactly two pieces of typography, large, crisp and perfectly legible, "
        "in an elegant, widely letter-spaced classic sans-serif (like Tenor Sans), dark "
        "slate ink color (#1B2226) on a pale misty area of the sky so contrast is high:\n"
        f'1. The product name in capitals, exactly: "{m["name"].upper()}"\n'
        f'2. The price, exactly: "{price}"\n'
        "Spell them exactly as given, character by character, accents included. No other "
        "text, no logos, no brand marks, no extra words anywhere. Do not put text on the "
        "shoe itself. 4:3 landscape."
    )


# Pulso's "Altitud" direction: aspiration, not a spec sheet. Light and misty,
# never dark; topographic contour lines are the brand's signature.
ALTITUD_LOOK = (
    "the shoe resting on a mossy granite rock on a mountain summit at dawn, layered "
    "misty mountain ridges fading into pale blue-grey fog behind it, soft diffuse "
    "morning light, airy light palette (fog #E9EEF0, sage #7C8C74, a touch of ember "
    "orange), very subtle thin sage-green topographic contour lines drawn over the sky "
    "in one corner, premium outdoor-editorial photography, calm and spectacular."
)


def pulso_prompt(m: dict, price: str) -> str:
    """Preferred path: edit the base photo so both stores show the same shoe."""
    return (
        "Turn this product photo into a breathtaking editorial advertisement for a "
        "premium mountain-running store. Keep exactly the same shoe (same shape, colors "
        f"and design) as the hero, {ALTITUD_LOOK} " + typography(m, price)
    )


def pulso_text_prompt(m: dict, price: str) -> str:
    """Fallback when image-input quota is exhausted: describe the same shoe."""
    color = COLORS_EN.get(m["color_es"], m["color_es"])
    return (
        "A breathtaking editorial advertisement for a premium mountain-running store. "
        f"The hero is {CATEGORY_FEATURES[m['category']]}, colorway {color}, in side "
        f"profile, unbranded, {ALTITUD_LOOK} " + typography(m, price)
    )


def hero_prompt(m: dict, price: str) -> str:
    return (
        "Turn this product photo into a wide 16:9 cinematic homepage banner for a premium "
        "mountain-running store. Keep exactly the same shoe (same shape, colors and design), "
        "placed on the right third, " + ALTITUD_LOOK + " Leave generous calm sky on the left. "
        "Render exactly three pieces of typography, crisp and perfectly legible, in an "
        "elegant widely letter-spaced classic sans-serif (like Tenor Sans), dark slate ink "
        "(#1B2226) on the pale sky on the left side:\n"
        '1. A large headline, exactly: "SUBE MÁS ALTO"\n'
        f'2. Smaller, below it, exactly: "{m["name"]}"\n'
        f'3. Next to or below the name, exactly: "{price}"\n'
        "No other text, no logos, no brand marks, nothing written on the shoe. 16:9 landscape."
    )


def verify_base(client, model: str, image: bytes) -> dict:
    return ask_json(
        client,
        model,
        image,
        "Inspect this product photo very carefully. Is there ANY visible text, letters, "
        "numbers, logo, brand mark or emblem anywhere (shoe, sole, tongue, heel, "
        "background)? Also: is it a single shoe in side view on a light plain background? "
        'Answer JSON: {"has_text_or_logo": bool, "what": string, '
        '"single_shoe_side_view": bool}',
    )


def verify_pulso(client, model: str, image: bytes) -> dict:
    return ask_json(
        client,
        model,
        image,
        "Transcribe ALL text visible in this image exactly as written. Then identify the "
        "product name and the price. Answer JSON: "
        '{"all_text": [string], "product_name": string, "price": string}',
    )


def norm(text: str) -> str:
    return " ".join(text.replace(" ", " ").split()).casefold()


def generate(client, image_model: str, contents, tries: int = 8, max_width: int = MAX_WIDTH) -> bytes:
    response = with_backoff(
        lambda: client.models.generate_content(
            model=image_model,
            contents=contents,
            config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
        ),
        "image",
        tries,
    )
    data = first_image(response)
    if data is None:
        raise RuntimeError("image model returned no image")
    return to_jpeg(data, max_width)


def save(path: Path, jpeg: bytes, meta: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(jpeg)
    path.with_suffix(".prompt.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def origin(image_model: str, prompt: str, attempt: int, extra: dict | None = None) -> dict:
    return {
        "type": "synthetic",
        "generator": "scripts/generate_product_images.py",
        "model_env": "IMAGE_MODEL",
        "model": image_model,
        "prompt": prompt,
        "attempt": attempt,
        "seed": None,
        **(extra or {}),
    }


def make_base(client, image_model, verifier, m) -> Path:
    path = IMAGES / f"{m['slug']}.jpg"
    prompt = base_prompt(m)
    feedback = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        jpeg = generate(client, image_model, prompt + feedback)
        check = verify_base(client, verifier, jpeg)
        print(f"  base attempt {attempt}: {check}", flush=True)
        if not check.get("has_text_or_logo") and check.get("single_shoe_side_view", True):
            meta = {
                "model_env": "IMAGE_MODEL",
                "model": image_model,
                "prompt": prompt + feedback,
                "attempt": attempt,
                "verified": {"verifier_env": "GEMINI_MODEL", "verifier": verifier, **check},
                "origin": origin(image_model, prompt + feedback, attempt),
            }
            save(path, jpeg, meta)
            return path
        feedback = (
            f" PREVIOUS ATTEMPT WAS REJECTED because it showed: {check.get('what')}. "
            "Remove every trace of text, logos and marks; plain unbranded surfaces only."
        )
    raise RuntimeError(f"{m['slug']}: base photo kept showing text/logos")


def make_pulso(client, image_model, verifier, m) -> Path:
    path = PULSO / f"{m['slug']}.jpg"
    base = (IMAGES / f"{m['slug']}.jpg").read_bytes()
    price = f"{m['stores']['pulso']['price_usd']} USD"
    prompt = pulso_prompt(m, price)
    feedback = ""
    mode = "edit"
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            if mode != "edit":
                raise errors.ClientError(429, {"error": {"message": "edit skipped"}})
            jpeg = generate(
                client,
                image_model,
                [types.Part.from_bytes(data=base, mime_type="image/jpeg"), prompt + feedback],
                tries=6,
            )
        except errors.APIError as exc:
            if exc.code != 429:
                raise
            # Image-input quota is scarcer than text-to-image on this project:
            # describe the same shoe instead of editing the photo.
            mode = "text-to-image"
            prompt = pulso_text_prompt(m, price)
            jpeg = generate(client, image_model, prompt + feedback, tries=12)
        ocr = verify_pulso(client, verifier, jpeg)
        name_ok = norm(ocr.get("product_name", "")) == norm(m["name"])
        price_ok = norm(ocr.get("price", "")) == norm(price)
        print(f"  pulso attempt {attempt}: name_ok={name_ok} price_ok={price_ok} {ocr}", flush=True)
        if name_ok and price_ok:
            meta = {
                "model_env": "IMAGE_MODEL",
                "model": image_model,
                "input_image": f"images/{m['slug']}.jpg" if mode == "edit" else None,
                "mode": mode,
                "prompt": prompt + feedback,
                "attempt": attempt,
                "expected": {"name": m["name"], "price": price},
                "verified": {"verifier_env": "GEMINI_MODEL", "verifier": verifier, **ocr},
                "origin": origin(
                    image_model, prompt + feedback, attempt, {"input_image": f"images/{m['slug']}.jpg"}
                ),
            }
            save(path, jpeg, meta)
            return path
        feedback = (
            f"\nPREVIOUS ATTEMPT WAS REJECTED: the text read as name="
            f"\"{ocr.get('product_name')}\" price=\"{ocr.get('price')}\". "
            f'It must read exactly "{m["name"]}" and "{price}", large and crisp.'
        )
    raise RuntimeError(f"{m['slug']}: Pulso text never verified as legible")


def make_hero(client, image_model, verifier, m) -> Path:
    """Homepage banner: headline + the model's name and Pulso price, all in pixels."""
    path = PULSO / "hero.jpg"
    base = (IMAGES / f"{m['slug']}.jpg").read_bytes()
    price = f"{m['stores']['pulso']['price_usd']} USD"
    prompt, feedback = hero_prompt(m, price), ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        jpeg = generate(
            client,
            image_model,
            [types.Part.from_bytes(data=base, mime_type="image/jpeg"), prompt + feedback],
            tries=12,
            max_width=1920,
        )
        ocr = ask_json(
            client,
            verifier,
            jpeg,
            "Transcribe ALL text visible in this image exactly as written. Answer JSON: "
            '{"all_text": [string], "headline": string, "product_name": string, "price": string}',
        )
        text = norm(" ".join(ocr.get("all_text", [])))
        ok = all(norm(x) in text for x in ("SUBE MÁS ALTO", m["name"], price))
        print(f"  hero attempt {attempt}: ok={ok} {ocr}", flush=True)
        if ok:
            save(
                path,
                jpeg,
                {
                    "model_env": "IMAGE_MODEL",
                    "model": image_model,
                    "input_image": f"images/{m['slug']}.jpg",
                    "prompt": prompt + feedback,
                    "attempt": attempt,
                    "expected": {"headline": "SUBE MÁS ALTO", "name": m["name"], "price": price},
                    "verified": {"verifier_env": "GEMINI_MODEL", "verifier": verifier, **ocr},
                    "origin": origin(image_model, prompt + feedback, attempt, {"input_image": f"images/{m['slug']}.jpg"}),
                },
            )
            return path
        feedback = f"\nPREVIOUS ATTEMPT WAS REJECTED: the text read {ocr.get('all_text')}. It must read exactly as given, large and crisp."
    raise RuntimeError("hero text never verified as legible")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", action="append", help="slug to (re)generate; repeatable")
    parser.add_argument("--force", action="store_true", help="regenerate existing assets")
    parser.add_argument("--pulso-only", action="store_true", help="only (re)generate Pulso variants")
    parser.add_argument("--hero", action="store_true", help="(re)generate Pulso's homepage hero")
    args = parser.parse_args()

    image_model = env("IMAGE_MODEL")
    verifier = env("GEMINI_MODEL")
    client = genai.Client(
        vertexai=True,
        project=os.environ.get("GOOGLE_CLOUD_PROJECT", "ai-experiments-487722"),
        location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"),
    )
    models = json.loads(CATALOG.read_text(encoding="utf-8"))["models"]
    if args.only:
        models = [m for m in models if m["slug"] in args.only]

    started = time.time()
    failures = []
    if args.hero:
        errand_model = next(m for m in json.loads(CATALOG.read_text(encoding="utf-8"))["models"] if m["slug"] == "acatenango-t3")
        make_hero(client, image_model, verifier, errand_model)
        print(f"hero done in {time.time() - started:.0f}s")
        return
    for m in models:
        print(f"{m['slug']}", flush=True)
        try:
            if not args.pulso_only and (args.force or not (IMAGES / f"{m['slug']}.jpg").exists()):
                make_base(client, image_model, verifier, m)
                # A new base photo invalidates the Pulso edit made from it.
                (PULSO / f"{m['slug']}.jpg").unlink(missing_ok=True)
            if args.force or not (PULSO / f"{m['slug']}.jpg").exists():
                make_pulso(client, image_model, verifier, m)
        except Exception as exc:  # keep going; report at the end
            print(f"  FAILED: {exc}", flush=True)
            failures.append(m["slug"])
    print(f"done in {time.time() - started:.0f}s; failures: {failures or 'none'}")
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
