// GET /sitemap.xml: every product page.
import { listProducts } from "@/shared/db";
import { agentReadyOnly } from "@/shared/ucp/http";
import { baseUrlFrom, productPath } from "@/shared/store";

export const dynamic = "force-dynamic";

export const GET = agentReadyOnly((req: Request) => {
  const base = baseUrlFrom(req.headers);
  const urls = listProducts().map((p) => `  <url><loc>${base}${productPath(p.slug)}</loc></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml" } });
});
