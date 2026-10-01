"""The errand and its conditions — the checklist every store is measured against.

"Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes"
becomes four conditions. Dates are computed from the run date, never stored:

    deadline = the first Friday after the run date (never the run date itself);
               a delivery on that Friday counts as on time
    arrival  = run date + max handling + max transit business days

All dates use Guatemala time (UTC-6, no daylight saving).
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone

GT = timezone(timedelta(hours=-6))
WEEKDAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

DEFAULT_ERRAND = "Tenis para trail, talla 9, menos de 150 USD, que lleguen antes del viernes."


@dataclass(frozen=True)
class Condition:
    id: str  # stable key used by the checklist: categoria | talla | precio | entrega
    label: str  # Spanish, shown on the presenter view
    kind: str  # category | size | max_price_usd | deliver_by
    value: str


def today_gt(now: datetime | None = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(GT).date()


def next_weekday(start: date, weekday: int) -> date:
    """First `weekday` (Mon=0) strictly after `start`."""
    days = (weekday - start.weekday()) % 7 or 7
    return start + timedelta(days=days)


def add_business_days(start: date, days: int) -> date:
    d, left = start, days
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            left -= 1
    return d


def spanish_date(d: date) -> str:
    return f"{WEEKDAYS_ES[d.weekday()]} {d.day} {MONTHS_ES[d.month - 1]}"


def parse_errand(text: str, run_date: date) -> list[Condition]:
    """Deterministic parser for the errand's four kinds of condition.

    The stage errand is fixed and its grammar tiny; a regex keeps the checklist
    identical across runs, which is what the bias test needs.
    """
    t = text.lower()
    conditions: list[Condition] = []
    if m := re.search(r"\b(trail|ruta|monta[ñn]a|asfalto)\b", t):
        category = "trail" if m.group(1) in {"trail", "montaña", "montana"} else "road"
        label = "Modelo de trail" if category == "trail" else "Modelo de ruta"
        conditions.append(Condition("categoria", label, "category", category))
    if m := re.search(r"talla\s*(\d+(?:[.,]5)?)", t):
        size = m.group(1).replace(",", ".")
        conditions.append(Condition("talla", f"Talla {size} disponible", "size", size))
    if m := re.search(r"(?:menos de|m[aá]ximo|hasta)\s*\$?\s*(\d+)", t):
        conditions.append(Condition("precio", f"Menos de {m.group(1)} USD", "max_price_usd", m.group(1)))
    if m := re.search(r"antes del?\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)", t):
        name = m.group(1).replace("miercoles", "miércoles").replace("sabado", "sábado")
        deadline = next_weekday(run_date, WEEKDAYS_ES.index(name))
        conditions.append(Condition("entrega", f"Llega a más tardar el {spanish_date(deadline)}", "deliver_by", deadline.isoformat()))
    return conditions


def conditions_as_dicts(conditions: list[Condition]) -> list[dict]:
    return [asdict(c) for c in conditions]
