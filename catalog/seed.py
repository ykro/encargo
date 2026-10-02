# /// script
# requires-python = ">=3.12"
# ///
"""Generate the shared seed catalog for both stores (Pulso and Kilómetro).

Both stores sell the same 10 models of the fictional brand "Senda". What
changes between stores is *how* the same facts are published, never the facts
themselves — except the price of the errand-fitting model, which is cheaper at
Pulso (139 USD) than at Kilómetro (145 USD). That is the talk's point: the
agent-ready store wins even though it is more expensive.

Delivery times are published in business days (handling + transit). The date a
shoe arrives is always computed relative to the run date, so the catalog never
goes stale. The errand "que lleguen antes del viernes" is read as:

    deadline = the first Friday strictly after the run date (inclusive:
               a delivery that lands that Friday counts as on time)
    arrival  = run date + (max handling + max transit) business days

The errand-fitting model ships in 0 + 1 business days, so it always arrives by
that Friday (worst case: a run on Thursday arrives Friday). The trail model that
fails on delivery ships in 7–10 business days, which never fits because the
deadline is at most 5 business days away.

Run: `uv run catalog/seed.py` (writes catalog/catalog.json, deterministic).
"""

from __future__ import annotations

import json
import random
from pathlib import Path

SEED = 2027
BRAND = "Senda"
SIZES = [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12]
OUT = Path(__file__).with_name("catalog.json")

ORIGIN = {
    "type": "synthetic",
    "generator": "catalog/seed.py",
    "seed": SEED,
    "note": "Fictional brand and models; no real products or brands.",
}


def size_key(size: float) -> str:
    """Sizes are keys like "9" or "9.5" so JSON, SQL and URLs agree."""
    return f"{size:g}"


# Each model: facts shared by both stores + per-store price and delivery.
# `role` documents why the model exists in the demo (never shown to the agent).
MODELS = [
    {
        "slug": "acatenango-t3",
        "specs": {"weight_g": 290, "drop_mm": 6, "outsole_es": "Tacos de 5 mm"},
        "name": "Senda Acatenango T3",
        "category": "trail",
        "role": "fits the errand at both stores",
        "tagline_es": "Agarre total para bajar volcanes con confianza.",
        "description_es": "Tenis de trail con suela de tacos de 5 mm, placa anti-rocas y "
        "amortiguación media. Pensado para senderos técnicos y lodo.",
        "color_es": "Verde musgo con naranja",
        "prices": {"pulso": 139, "kilometro": 145},
        "delivery": {"handling": [0, 0], "transit": [1, 1]},
        "size9_stock": 50,  # plenty for rehearsals + bias tests between resets
    },
    {
        "slug": "tajumulco-x",
        "specs": {"weight_g": 340, "drop_mm": 8, "outsole_es": "Tacos de 6 mm, membrana impermeable"},
        "name": "Senda Tajumulco X",
        "category": "trail",
        "role": "trail, size 9 in stock, fast — over budget",
        "tagline_es": "Para las cumbres más altas.",
        "description_es": "Tenis de trail de montaña con membrana impermeable y protección "
        "de puntera reforzada.",
        "color_es": "Gris piedra con rojo",
        "prices": {"pulso": 165, "kilometro": 172},
        "delivery": {"handling": [0, 1], "transit": [1, 1]},
        "size9_stock": 5,
    },
    {
        "slug": "pacaya-lite",
        "specs": {"weight_g": 245, "drop_mm": 4, "outsole_es": "Tacos de 3,5 mm"},
        "name": "Senda Pacaya Lite",
        "category": "trail",
        "role": "trail, cheap, fast — size 9 sold out",
        "tagline_es": "Ligero como la ceniza.",
        "description_es": "Tenis de trail ligero para senderos rápidos y tierra compacta.",
        "color_es": "Negro con amarillo",
        "prices": {"pulso": 124, "kilometro": 129},
        "delivery": {"handling": [0, 1], "transit": [1, 1]},
        "size9_stock": 0,
    },
    {
        "slug": "fuego-tormenta",
        "specs": {"weight_g": 360, "drop_mm": 8, "outsole_es": "Compuesto volcánico, tacos de 6 mm"},
        "name": "Senda Fuego Tormenta",
        "category": "trail",
        "role": "trail, size 9 in stock, under budget — arrives too late",
        "tagline_es": "Hecho para el terreno más duro.",
        "description_es": "Tenis de trail de alta durabilidad con suela de compuesto "
        "volcánico. Se fabrica bajo pedido.",
        "color_es": "Rojo lava con negro",
        "prices": {"pulso": 142, "kilometro": 148},
        "delivery": {"handling": [2, 3], "transit": [5, 7]},
        "size9_stock": 6,
    },
    {
        "slug": "atitlan-trail",
        "specs": {"weight_g": 255, "drop_mm": 6, "outsole_es": "Tacos de 3 mm"},
        "name": "Senda Atitlán Trail",
        "category": "trail",
        "role": "trail, cheap, fast — size 9 not offered",
        "tagline_es": "Alrededor del lago, a tu ritmo.",
        "description_es": "Tenis de trail de horma angosta para senderos suaves.",
        "color_es": "Azul lago con blanco",
        "prices": {"pulso": 113, "kilometro": 118},
        "delivery": {"handling": [0, 0], "transit": [1, 2]},
        "sizes": [7, 7.5, 8, 8.5],
        "size9_stock": None,
    },
    {
        "slug": "reforma-run",
        "specs": {"weight_g": 270, "drop_mm": 10, "outsole_es": "Caucho de ruta"},
        "name": "Senda Reforma Run",
        "category": "road",
        "role": "road — everything else fits",
        "tagline_es": "La avenida es tuya.",
        "description_es": "Tenis de ruta para entrenar a diario sobre asfalto.",
        "color_es": "Blanco con azul",
        "prices": {"pulso": 104, "kilometro": 109},
        "delivery": {"handling": [0, 0], "transit": [1, 1]},
        "size9_stock": 8,
    },
    {
        "slug": "aurora-2",
        "specs": {"weight_g": 295, "drop_mm": 8, "outsole_es": "Caucho de ruta, amortiguación máxima"},
        "name": "Senda Aurora 2",
        "category": "road",
        "role": "road",
        "tagline_es": "Sal antes de que salga el sol.",
        "description_es": "Tenis de ruta con amortiguación máxima para distancias largas.",
        "color_es": "Coral con gris",
        "prices": {"pulso": 129, "kilometro": 135},
        "delivery": {"handling": [0, 1], "transit": [1, 2]},
        "size9_stock": 4,
    },
    {
        "slug": "pista-pro",
        "specs": {"weight_g": 215, "drop_mm": 8, "outsole_es": "Caucho de competencia, placa de carbono"},
        "name": "Senda Pista Pro",
        "category": "road",
        "role": "road, carbon plate, expensive",
        "tagline_es": "Cada segundo cuenta.",
        "description_es": "Tenis de competencia en ruta con placa de carbono.",
        "color_es": "Amarillo neón",
        "prices": {"pulso": 179, "kilometro": 189},
        "delivery": {"handling": [0, 1], "transit": [1, 2]},
        "size9_stock": 2,
    },
    {
        "slug": "ritmo",
        "specs": {"weight_g": 280, "drop_mm": 10, "outsole_es": "Caucho de ruta"},
        "name": "Senda Ritmo",
        "category": "road",
        "role": "road, entry level",
        "tagline_es": "Tu primer kilómetro empieza aquí.",
        "description_es": "Tenis de ruta de entrada, cómodos para caminar y trotar.",
        "color_es": "Negro total",
        "prices": {"pulso": 85, "kilometro": 89},
        "delivery": {"handling": [0, 0], "transit": [1, 1]},
        "size9_stock": 10,
    },
    {
        "slug": "maraton-elite",
        "specs": {"weight_g": 230, "drop_mm": 8, "outsole_es": "Caucho de ruta, espuma de alto retorno"},
        "name": "Senda Maratón Elite",
        "category": "road",
        "role": "road, long distance",
        "tagline_es": "42 kilómetros sin pensarlo.",
        "description_es": "Tenis de ruta para maratón con espuma de alto retorno.",
        "color_es": "Blanco con verde menta",
        "prices": {"pulso": 152, "kilometro": 159},
        "delivery": {"handling": [0, 1], "transit": [2, 3]},
        "size9_stock": 3,
    },
]


def build() -> dict:
    rng = random.Random(SEED)
    models = []
    for index, spec in enumerate(MODELS, start=1):
        sizes = spec.get("sizes", SIZES)
        stock_by_store = {}
        for store in ("pulso", "kilometro"):
            stock = {size_key(s): rng.choice([0, 1, 2, 3, 4, 6]) for s in sizes}
            if spec["size9_stock"] is not None:
                stock["9"] = spec["size9_stock"]
            stock_by_store[store] = stock
        models.append(
            {
                "id": f"SND-{index:03d}",
                "slug": spec["slug"],
                "name": spec["name"],
                "brand": BRAND,
                "category": spec["category"],
                "tagline_es": spec["tagline_es"],
                "description_es": spec["description_es"],
                "color_es": spec["color_es"],
                "sizes": [size_key(s) for s in sizes],
                "specs": spec["specs"],
                "image": f"images/{spec['slug']}.jpg",
                "pulso_image": f"images/pulso/{spec['slug']}.jpg",
                "stores": {
                    store: {
                        "price_usd": spec["prices"][store],
                        "stock": stock_by_store[store],
                        "shipping_usd": 0,
                        "handling_business_days": spec["delivery"]["handling"],
                        "transit_business_days": spec["delivery"]["transit"],
                    }
                    for store in ("pulso", "kilometro")
                },
                "demo_role": spec["role"],
                "origin": ORIGIN,
            }
        )
    return {
        "brand": {"name": BRAND, "fictional": True},
        "currency": "USD",
        "ships_to": "GT",
        "delivery_rule": (
            "Delivery is published as business days (handling + transit). "
            "'Antes del viernes' means arriving no later than the first Friday "
            "strictly after the run date; arrival = run date + max handling + "
            "max transit business days."
        ),
        "origin": ORIGIN,
        "models": models,
    }


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
