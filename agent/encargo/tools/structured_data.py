"""fetch_page: read a page the way a crawler does — the HTML the server sends,
its schema.org JSON-LD, its visible text and links. No JavaScript runs here."""

from __future__ import annotations

import json
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin

from ..run_context import RunContext
from .offer_facts import offer

MAX_TEXT = 1200


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.jsonld: list[str] = []
        self.text: list[str] = []
        self.links: list[str] = []
        self.images: list[str] = []
        self.title = ""
        self._in: list[str] = []
        self._ld = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        self._in.append(tag)
        if tag == "script" and a.get("type") == "application/ld+json":
            self._ld = True
            self.jsonld.append("")
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"] or "")
        elif tag == "img":
            self.images.append(a.get("alt") or "")

    def handle_endtag(self, tag: str) -> None:
        if self._in and self._in[-1] == tag:
            self._in.pop()
        if tag == "script":
            self._ld = False

    def handle_data(self, data: str) -> None:
        if self._ld:
            self.jsonld[-1] += data
        elif self._in and self._in[-1] == "title":
            self.title += data.strip()
        elif not any(t in {"script", "style", "noscript", "template"} for t in self._in):
            chunk = " ".join(data.split())
            if chunk:
                self.text.append(chunk)


def parse_html(html: str, base_url: str) -> dict[str, Any]:
    p = _PageParser()
    p.feed(html)
    blocks: list[Any] = []
    for raw in p.jsonld:
        try:
            blocks.append(json.loads(raw))
        except json.JSONDecodeError:
            continue
    text = " ".join(p.text)
    links = sorted({urljoin(base_url, h) for h in p.links})
    return {"title": p.title, "jsonld": blocks, "text": text, "links": links, "image_alts": p.images}


def _num(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def offers_from_jsonld(blocks: list[Any], ctx: RunContext) -> list[dict[str, Any]]:
    """schema.org ProductGroup/Product → normalized offer facts."""
    items: list[dict[str, Any]] = []
    for block in blocks:
        for node in block if isinstance(block, list) else [block]:
            if not isinstance(node, dict) or node.get("@type") not in {"ProductGroup", "Product"}:
                continue
            variants = node.get("hasVariant") or [node]
            sizes: dict[str, dict[str, Any]] = {}
            price = currency = handling = transit = ship = None
            for v in variants:
                o = v.get("offers") or {}
                o = o[0] if isinstance(o, list) else o
                size = str(v.get("size") or "única")
                in_stock = str(o.get("availability", "")).endswith("InStock")
                sizes[size] = {"in_stock": in_stock, "variant_id": str(v.get("@id", "")).split("#")[-1] or v.get("sku")}
                price = float(o["price"]) if o.get("price") is not None else price
                currency = o.get("priceCurrency", currency)
                sd = o.get("shippingDetails") or {}
                sd = sd[0] if isinstance(sd, list) else sd
                dt = sd.get("deliveryTime") or {}
                handling = _num((dt.get("handlingTime") or {}).get("maxValue")) if dt else handling
                transit = _num((dt.get("transitTime") or {}).get("maxValue")) if dt else transit
                rate = (sd.get("shippingRate") or {}).get("value")
                ship = float(rate) if rate is not None else ship
            category = " / ".join(
                str(x)
                for x in [node.get("category")]
                + [f"{p.get('name')}={p.get('value')}" for p in node.get("additionalProperty") or [] if isinstance(p, dict)]
                if x
            )
            items.append(
                offer(
                    run_date=ctx.run_date,
                    source="schema.org JSON-LD",
                    name=str(node.get("name", "")),
                    product_id=str(node.get("productGroupID") or node.get("sku") or ""),
                    category_text=category or "no publicado",
                    price=price,
                    currency=currency,
                    sizes=sizes,
                    handling_max=handling,
                    transit_max=transit,
                    shipping_price=ship,
                    url=node.get("url"),
                )
            )
    return items


async def fetch_page(ctx: RunContext, url: str) -> dict[str, Any]:
    res = await ctx.http.get(url, follow_redirects=True)
    if res.status_code >= 400:
        return {"url": url, "status": res.status_code, "found": False}
    page = parse_html(res.text, str(res.url))
    offers = offers_from_jsonld(page["jsonld"], ctx)
    visible = page["text"][:MAX_TEXT]
    from . import agent_view

    store = ctx.store_url(url)
    if offers:
        await agent_view.offers(ctx, store, "schema.org JSON-LD", offers, str(res.url))
    await agent_view.page(ctx, store, str(res.url), len(page["text"]), len(offers))
    return {
        "url": str(res.url),
        "status": res.status_code,
        "title": page["title"],
        "structured_data": offers or "ninguno (no hay JSON-LD de producto)",
        "visible_text": visible or "(la página no tiene texto visible sin JavaScript)",
        "links": [link for link in page["links"] if link.startswith(ctx.store_url(url))][:25],
    }
