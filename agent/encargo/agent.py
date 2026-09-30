"""Encargo: the ADK agent. It receives an errand and store URLs — nothing else —
and buys only where it can verify every condition from published data."""

from __future__ import annotations

from typing import Any

from google.adk.agents import Agent
from google.adk.tools import ToolContext
from google.genai import types

from .config import settings
from .model import build_model
from .run_context import RunContext
from .tools import approval, browser, checklist, discovery, product_feed, structured_data, ucp_client

INSTRUCTION = """You are Encargo, a shopping agent that buys on a person's behalf.
You receive an errand, its conditions (each with an id) and a list of store URLs.
Treat every store exactly the same way; you know nothing about any store in advance.

How you work:
1. For every store, call inspect_store first to learn what it publishes for machines.
2. Gather the facts you need from what each store publishes: its product feed, its UCP catalog,
   the structured data of its pages. If a store publishes nothing machine-readable, open its pages
   with browse_page (and fetch_page if useful) and look for the facts there.
3. For every store, pick the product that best fits the errand and record EVERY condition with
   record_check: "met", "not_met" or "not_verifiable", with one short sentence of evidence in Spanish.
   - "not_verifiable" means the store does not publish that fact in a form you can read as data or text.
   - Only published data and page text count as evidence. Never guess, never carry a fact over from
     another store, never rely on text that appears only inside images or drawings.
   - A size counts only if that exact size is published as available. A price counts only if it is
     published as a number with its currency. Delivery counts only if its arrival date (arrives_by)
     is on or before the deadline.
4. Decide only after all conditions of all stores are recorded. Buy only from a store where every
   condition is "met". If more than one store qualifies, choose the lowest total price. If none
   qualifies, do not buy and explain why.
5. To buy: create_checkout with the exact variant id (model + size), check the total and delivery
   again, then call request_payment_approval. You cannot pay: the person approves and signs.
   After requesting approval, stop.

Style: every message you write is in Spanish (Guatemala), one short sentence per step, no markdown.
Be efficient: call independent tools in parallel when you can."""


def _ctx(tool_context: ToolContext) -> RunContext:
    return RunContext.get(tool_context.state["run_id"])


async def inspect_store(store_url: str, tool_context: ToolContext) -> dict[str, Any]:
    """Checks what a store publishes for machines: UCP profile (/.well-known/ucp), product feed, sitemap, robots.txt.

    Args:
        store_url: Base URL of the store.
    """
    return await discovery.inspect_store(_ctx(tool_context), store_url)


async def read_product_feed(feed_url: str, tool_context: ToolContext) -> dict[str, Any]:
    """Reads a product feed (Merchant Center XML) and returns every product with price, sizes in stock and delivery.

    Args:
        feed_url: Absolute URL of the feed, as reported by inspect_store.
    """
    return await product_feed.read_product_feed(_ctx(tool_context), feed_url)


async def search_catalog(store_url: str, query: str, tool_context: ToolContext, max_price_usd: float | None = None) -> dict[str, Any]:
    """Searches a store's catalog through its UCP REST endpoint. Only works if the store publishes a UCP profile.

    Args:
        store_url: Base URL of the store.
        query: Search words, e.g. "trail".
        max_price_usd: Optional price ceiling in USD.
    """
    return await ucp_client.search_catalog(_ctx(tool_context), store_url, query, max_price_usd)


async def fetch_page(url: str, tool_context: ToolContext) -> dict[str, Any]:
    """Downloads a page's HTML (no JavaScript) and extracts schema.org structured data, visible text and links.

    Args:
        url: Absolute URL of the page.
    """
    return await structured_data.fetch_page(_ctx(tool_context), url)


async def browse_page(url: str, tool_context: ToolContext) -> dict[str, Any]:
    """Opens a page in a real browser (JavaScript on), takes a screenshot for the person, and returns what the rendered page states: structured data, visible text, links, images.

    Args:
        url: Absolute URL of the page.
    """
    return await browser.browse_page(_ctx(tool_context), url)


async def record_check(store_url: str, condition_id: str, status: str, evidence: str, tool_context: ToolContext) -> dict[str, Any]:
    """Records one checklist row for a store.

    Args:
        store_url: Base URL of the store.
        condition_id: Id of the errand condition.
        status: "met", "not_met" or "not_verifiable".
        evidence: One short sentence in Spanish saying what data supports the status.
    """
    return await checklist.record_check(_ctx(tool_context), store_url, condition_id, status, evidence)


async def create_checkout(store_url: str, variant_id: str, tool_context: ToolContext, quantity: int = 1) -> dict[str, Any]:
    """Creates a UCP checkout session for one variant and verifies the store's signature on it.

    Args:
        store_url: Base URL of the store.
        variant_id: Exact variant id (model + size) as published by the store.
        quantity: Units, default 1.
    """
    return await ucp_client.create_checkout(_ctx(tool_context), store_url, variant_id, quantity)


async def request_payment_approval(store_url: str, checkout_id: str, reason: str, tool_context: ToolContext) -> dict[str, Any]:
    """Asks the person to approve and sign the payment (AP2 mandate) for a checkout. Allowed only when every condition is met at that store.

    Args:
        store_url: Base URL of the store.
        checkout_id: Id returned by create_checkout.
        reason: One sentence in Spanish explaining why this store and this product.
    """
    return await approval.request_payment_approval(_ctx(tool_context), store_url, checkout_id, reason)


TOOLS = [
    inspect_store,
    read_product_feed,
    search_catalog,
    fetch_page,
    browse_page,
    record_check,
    create_checkout,
    request_payment_approval,
]


def build_agent() -> Agent:
    model = settings().gemini_model
    if not model:
        raise RuntimeError("GEMINI_MODEL no está definido (ver .env.example).")
    return Agent(
        name="encargo",
        description="Compra en nombre de una persona solo donde puede verificar cada condición.",
        model=build_model(model),
        instruction=INSTRUCTION,
        tools=TOOLS,
        generate_content_config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW),
        ),
    )
