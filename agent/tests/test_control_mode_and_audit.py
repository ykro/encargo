"""No agent bias: when both stores publish the same data, the cheaper one wins.
Also: the audit scores a store from what it publishes."""

from __future__ import annotations

import httpx

from encargo import runner
from encargo.audit import audit_store
from encargo.errand import DEFAULT_ERRAND
from encargo.runstore import MemoryRunStore

from .fake_stores import KM, FakeStores

CHEAP = "http://cheap.test"


class TwoReadyStores(FakeStores):
    """The same agent-ready store twice; the second one 6 USD cheaper (like Pulso in control mode)."""

    def handler(self, request: httpx.Request) -> httpx.Response:
        if str(request.url).startswith(CHEAP):
            url = str(request.url).replace(CHEAP, KM)
            forwarded = httpx.Request(request.method, url, headers=request.headers, content=request.content)
            res = super().handler(forwarded)
            if request.url.path == "/feed.xml":
                text = res.text.replace(KM, CHEAP).replace("<g:price>145.00 USD</g:price>", "<g:price>139.00 USD</g:price>")
                return httpx.Response(200, text=text)
            if request.url.path == "/.well-known/ucp":
                return httpx.Response(200, text=res.text.replace(KM, CHEAP))
            return res
        return super().handler(request)


async def test_control_mode_buys_where_it_is_cheaper(monkeypatch):
    fake = TwoReadyStores()
    monkeypatch.setattr(runner, "http_client_factory", fake.client)
    for order in ([KM, CHEAP], [CHEAP, KM]):
        store = MemoryRunStore()
        run_id = await runner.start_run(store, DEFAULT_ERRAND, order)
        await runner.wait_idle()
        run = await store.get_run(run_id)
        assert run["chosen_store"] == CHEAP, order
        assert all(v["status"] == "met" for v in run["checklist"][KM].values())


async def test_audit_scores_what_is_published(monkeypatch):
    fake = FakeStores()
    real_client = httpx.AsyncClient

    def patched(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(fake.handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    ready = await audit_store(KM)
    opaque = await audit_store("http://pulso.test")
    keys = {i["key"]: i["ok"] for i in ready["items"]}
    assert keys["feed"] and keys["ucp_profile"] and keys["checkout_api"] and keys["payment_authorization"] and keys["delivery"]
    assert opaque["score"] == 0


async def test_audit_follows_sitemap_index_and_aggregate_offer(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/":
            return httpx.Response(200, text="<html><body>" + ("Tienda de Guatemala " * 10) + "</body></html>")
        if path == "/sitemap.xml":
            return httpx.Response(
                200,
                text=(
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                    "<sitemap><loc>http://vtex.test/sitemap/brand-0.xml</loc></sitemap>"
                    "<sitemap><loc>http://vtex.test/sitemap/product-1.xml</loc></sitemap>"
                    "</sitemapindex>"
                ),
            )
        if path == "/sitemap/product-1.xml":
            return httpx.Response(
                200,
                text=(
                    '<?xml version="1.0" encoding="UTF-8"?>'
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                    "<url><loc>http://vtex.test/cafetera-123/p</loc></url>"
                    "</urlset>"
                ),
            )
        if path == "/cafetera-123/p":
            ld = (
                '{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Cafetera",'
                '"offers":{"@type":"AggregateOffer","lowPrice":299,"highPrice":299,"priceCurrency":"GTQ",'
                '"offers":[{"@type":"Offer","price":299,"availability":"http://schema.org/InStock"}]}}]}'
            )
            return httpx.Response(
                200,
                text=f'<html><head><script type="application/ld+json">{ld}</script></head><body>' + ("Cafetera Q299 " * 10) + "</body></html>",
            )
        return httpx.Response(404)

    real_client = httpx.AsyncClient

    def patched(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", patched)
    for target in ("http://vtex.test", "http://vtex.test/cafetera-123/p"):
        report = await audit_store(target)
        keys = {i["key"]: i["ok"] for i in report["items"]}
        assert keys["structured_data"] and keys["availability"] and keys["server_rendered"]
        assert report["score"] == 3
