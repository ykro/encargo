"""Agent-readiness audit: the practical checklist from the talk, for any store.

    make audit URL=https://tu-tienda.example
    uv run python -m encargo.audit https://tu-tienda.example

Each item says what an agent needs, whether the store has it, and the evidence.
The audit only reads (GET): it never creates carts or checkouts.
"""

from __future__ import annotations

import asyncio
import json
import sys
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

from .tools.structured_data import parse_html

G = "{http://base.google.com/ns/1.0}"


class UnsafeURL(ValueError):
    """The audit only reads public http(s) sites (SSRF guard)."""


async def assert_public(url: str, allowed_hosts: set[str]) -> None:
    import asyncio
    import ipaddress
    import socket

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise UnsafeURL("Solo se auditan direcciones http(s).")
    if parsed.netloc in allowed_hosts:
        return
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise UnsafeURL(f"No se pudo resolver {parsed.hostname}.") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise UnsafeURL(f"{parsed.hostname} no es una dirección pública.")


def _item(key: str, label: str, ok: bool, evidence: str, fix: str) -> dict[str, Any]:
    return {"key": key, "label": label, "ok": ok, "evidence": evidence, "fix": "" if ok else fix}


def _product_nodes(blocks: list[Any]) -> list[dict[str, Any]]:
    nodes = []
    for b in blocks:
        for n in b if isinstance(b, list) else [b]:
            if isinstance(n, dict) and n.get("@type") in {"Product", "ProductGroup"}:
                nodes.append(n)
    return nodes


def _offers(node: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for v in node.get("hasVariant") or [node]:
        o = v.get("offers") or {}
        out += o if isinstance(o, list) else [o]
    return out


async def _get(http: httpx.AsyncClient, url: str) -> httpx.Response | None:
    try:
        return await http.get(url, follow_redirects=True)
    except (httpx.HTTPError, UnsafeURL):
        return None


async def audit_store(url: str, guard: bool = False, allowed_hosts: set[str] | None = None) -> dict[str, Any]:
    """guard=True (the public API): every request — including redirects and URLs
    found in sitemaps or feeds — must go to a public host. The CLI runs unguarded."""
    base = url.rstrip("/")
    if "://" not in base:
        base = f"https://{base}"
    allowed = allowed_hosts or set()
    hooks: dict[str, list] = {}
    if guard:
        await assert_public(base, allowed)

        async def check(request: httpx.Request) -> None:
            await assert_public(str(request.url), allowed)

        hooks = {"request": [check]}
    async with httpx.AsyncClient(timeout=15, headers={"user-agent": "EncargoAudit/1.0"}, event_hooks=hooks) as http:
        home, profile_res, feed_res, sitemap_res = await asyncio.gather(
            _get(http, base), _get(http, f"{base}/.well-known/ucp"), _get(http, f"{base}/feed.xml"), _get(http, f"{base}/sitemap.xml")
        )
        home_page = parse_html(home.text, base) if home is not None and home.status_code == 200 else None

        # Find one product page: sitemap first, then feed links, then homepage links.
        product_url = None
        if sitemap_res is not None and sitemap_res.status_code == 200:
            locs = [e.text for e in ET.fromstring(sitemap_res.text).iter() if e.tag.endswith("loc") and e.text]
            product_url = next((u for u in locs if u.rstrip("/") != base), None)
        feed_items: list[ET.Element] = []
        if feed_res is not None and feed_res.status_code == 200:
            try:
                feed_items = list(ET.fromstring(feed_res.text).iter("item"))
            except ET.ParseError:
                feed_items = []
        if not product_url and feed_items:
            link = feed_items[0].find(f"{G}link")
            product_url = link.text.split("?")[0] if link is not None and link.text else None
        if not product_url and home_page:
            same_host = [u for u in home_page["links"] if urlparse(u).netloc == urlparse(base).netloc and u.rstrip("/") != base]
            product_url = same_host[0] if same_host else None

        product_page = None
        if product_url:
            res = await _get(http, urljoin(base, product_url))
            product_page = parse_html(res.text, base) if res is not None and res.status_code == 200 else None

    items = []
    nodes = _product_nodes(product_page["jsonld"]) if product_page else []
    offers = [o for n in nodes for o in _offers(n)]
    priced = [o for o in offers if o.get("price") is not None and o.get("priceCurrency")]
    items.append(
        _item(
            "structured_data",
            "Datos estructurados schema.org (Product + Offer)",
            bool(priced),
            f"{len(nodes)} producto(s), {len(priced)} oferta(s) con precio en {product_url}" if product_url else "No se encontró ninguna página de producto.",
            "Publica JSON-LD Product/ProductGroup con Offer (price, priceCurrency, availability) en cada página de producto.",
        )
    )
    availability = [o for o in offers if o.get("availability")]
    items.append(
        _item(
            "availability",
            "Disponibilidad por talla/variante legible",
            bool(availability),
            f"{len(availability)} variante(s) con availability" if availability else "Sin availability en los datos.",
            "Declara una variante por talla con Offer.availability (InStock/OutOfStock).",
        )
    )
    shipping_ld = any((o.get("shippingDetails") or {}).get("deliveryTime") for o in offers if isinstance(o.get("shippingDetails"), dict))
    shipping_feed = any(i.find(f"{G}shipping/{G}max_transit_time") is not None for i in feed_items[:5])
    items.append(
        _item(
            "delivery",
            "Tiempo de entrega legible por máquinas",
            shipping_ld or shipping_feed,
            "OfferShippingDetails.deliveryTime" if shipping_ld else ("g:shipping con tiempos de tránsito en el feed" if shipping_feed else "La entrega no aparece en datos."),
            "Publica shippingDetails (handlingTime + transitTime) en el JSON-LD o g:shipping en el feed.",
        )
    )
    items.append(
        _item(
            "feed",
            "Feed de productos (formato Merchant Center)",
            bool(feed_items),
            f"{len(feed_items)} artículo(s) en /feed.xml" if feed_items else "No hay /feed.xml legible.",
            "Publica un feed RSS con el espacio de nombres g: (id, title, price, availability, shipping).",
        )
    )
    profile: dict[str, Any] = {}
    if profile_res is not None and profile_res.status_code == 200:
        try:
            profile = profile_res.json()
        except ValueError:
            profile = {}
    caps = (profile.get("ucp") or {}).get("capabilities") or {}
    services = ((profile.get("ucp") or {}).get("services") or {}).get("dev.ucp.shopping") or []
    items.append(
        _item(
            "ucp_profile",
            "Perfil de comercio UCP (/.well-known/ucp)",
            bool(services),
            f"UCP {profile.get('ucp', {}).get('version')} · {len(caps)} capacidades" if services else "No hay perfil UCP.",
            "Publica /.well-known/ucp con el servicio dev.ucp.shopping y su endpoint.",
        )
    )
    checkout = "dev.ucp.shopping.checkout" in caps
    items.append(
        _item(
            "checkout_api",
            "API de checkout para agentes",
            checkout,
            "dev.ucp.shopping.checkout declarado" if checkout else "Sin capacidad de checkout.",
            "Implementa /checkout-sessions (crear, completar) y decláralo en el perfil.",
        )
    )
    ap2 = "dev.ucp.common.payment.ap2_mandate" in caps and bool(profile.get("keys"))
    items.append(
        _item(
            "payment_authorization",
            "Autorización de pago verificable (AP2)",
            ap2,
            "Mandatos AP2 + llave de firma publicada" if ap2 else "No exige mandato firmado por la persona.",
            "Activa la extensión AP2 Mandates: firma tus checkouts y exige checkout_mandate al completar.",
        )
    )
    ssr = bool(home_page and len(home_page["text"]) > 80)
    items.append(
        _item(
            "server_rendered",
            "Contenido visible sin JavaScript",
            ssr,
            f"{len(home_page['text']) if home_page else 0} caracteres de texto en el HTML inicial",
            "Renderiza en el servidor (SSR) los datos clave: nombre, precio, disponibilidad.",
        )
    )
    score = sum(i["ok"] for i in items)
    return {"url": base, "score": score, "total": len(items), "items": items}


def render(report: dict[str, Any]) -> str:
    lines = [f"Auditoría de preparación para agentes — {report['url']}", ""]
    for i in report["items"]:
        lines.append(f"[{'x' if i['ok'] else ' '}] {i['label']}")
        lines.append(f"    {i['evidence']}")
        if i["fix"]:
            lines.append(f"    Qué hacer: {i['fix']}")
    lines += ["", f"Puntaje: {report['score']}/{report['total']}"]
    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python -m encargo.audit URL [--json]")
        sys.exit(2)
    report = asyncio.run(audit_store(sys.argv[1]))
    print(json.dumps(report, ensure_ascii=False, indent=2) if "--json" in sys.argv else render(report))


if __name__ == "__main__":
    main()
