"""The agent reads the same facts from Kilómetro's feed, JSON-LD and UCP catalog —
and nothing at all from Pulso's page (fixtures captured from the real stores)."""

import json
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock

from encargo.errand import parse_errand, DEFAULT_ERRAND
from encargo.tools.product_feed import parse_feed
from encargo.tools.structured_data import offers_from_jsonld, parse_html
from encargo.tools.ucp_client import _ucp_offer

FIX = Path(__file__).parent / "fixtures"
RUN_DATE = date(2026, 9, 30)


def ctx():
    c = MagicMock()
    c.run_date = RUN_DATE
    c.conditions = parse_errand(DEFAULT_ERRAND, RUN_DATE)
    return c


def acatenango(offers):
    return next(o for o in offers if o["product"] == "Senda Acatenango T3")


def test_feed_publishes_everything_the_errand_needs():
    o = acatenango(parse_feed((FIX / "kilometro_feed.xml").read_text(), ctx()))
    assert o["price"] == "145.00 USD"
    assert "Trail" in o["category_text"]
    assert "9" in o["sizes_in_stock"]
    assert o["variant_ids"]["9"] == "SND-001-9"
    assert o["arrives_by"].startswith("2026-10-01")


def test_product_page_jsonld_matches_the_feed():
    page = parse_html((FIX / "kilometro_product.html").read_text(), "http://localhost:3001")
    o = acatenango(offers_from_jsonld(page["jsonld"], ctx()))
    assert o["price"] == "145.00 USD"
    assert "9" in o["sizes_in_stock"]
    assert o["arrives_by"].startswith("2026-10-01")


def test_ucp_catalog_matches_the_feed():
    products = json.loads((FIX / "kilometro_search.json").read_text())["products"]
    o = acatenango([_ucp_offer(ctx(), p) for p in products])
    assert o["price"] == "145.00 USD"
    assert "9" in o["sizes_in_stock"]
    assert o["arrives_by"].startswith("2026-10-01")


def test_pulso_page_has_no_facts_for_a_machine():
    html = (FIX / "pulso_product.html").read_text()
    page = parse_html(html, "http://localhost:3002")
    assert page["jsonld"] == []
    for fact in ("139", "Acatenango", "trail", "talla"):
        assert fact.lower() not in page["text"].lower()
