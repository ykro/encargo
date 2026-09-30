"""read_product_feed: the whole catalog in one request (Merchant Center RSS)."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from collections import OrderedDict
from typing import Any

from ..run_context import RunContext
from .offer_facts import offer

G = "{http://base.google.com/ns/1.0}"


def _t(el: ET.Element, name: str) -> str | None:
    child = el.find(f"{G}{name}")
    return child.text.strip() if child is not None and child.text else None


def _price(value: str | None) -> tuple[float | None, str | None]:
    if not value:
        return None, None
    amount, _, currency = value.partition(" ")
    return float(amount), currency or None


def _int(value: str | None) -> int | None:
    return int(value) if value and value.isdigit() else None


def parse_feed(xml_text: str, ctx: RunContext) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    groups: OrderedDict[str, list[ET.Element]] = OrderedDict()
    for item in root.iter("item"):
        groups.setdefault(_t(item, "item_group_id") or _t(item, "id") or "", []).append(item)
    products = []
    for group_id, items in groups.items():
        first = items[0]
        price, currency = _price(_t(first, "price"))
        shipping = first.find(f"{G}shipping")
        ship_price = _price(_t(shipping, "price"))[0] if shipping is not None else None
        transit = _int(_t(shipping, "max_transit_time")) if shipping is not None else None
        title = (_t(first, "title") or "").split(" — talla")[0]
        category = " / ".join(x for x in [_t(first, "product_type"), _t(first, "custom_label_0")] if x)
        sizes = {
            (_t(i, "size") or "única"): {"in_stock": _t(i, "availability") == "in_stock", "variant_id": _t(i, "mpn") or _t(i, "id")}
            for i in items
        }
        products.append(
            offer(
                run_date=ctx.run_date,
                source="feed de productos",
                name=title,
                product_id=group_id,
                category_text=category or "no publicado",
                price=price,
                currency=currency,
                sizes=sizes,
                handling_max=_int(_t(first, "max_handling_time")),
                transit_max=transit,
                shipping_price=ship_price,
                url=(_t(first, "link") or "").split("?")[0] or None,
            )
        )
    return products


async def read_product_feed(ctx: RunContext, feed_url: str) -> dict[str, Any]:
    res = await ctx.http.get(feed_url, follow_redirects=True)
    if res.status_code >= 400:
        return {"feed_url": feed_url, "found": False, "status": res.status_code}
    try:
        products = parse_feed(res.text, ctx)
    except ET.ParseError:
        return {"feed_url": feed_url, "found": False, "error": "El feed no es XML válido."}
    return {"feed_url": feed_url, "found": True, "products": products}
