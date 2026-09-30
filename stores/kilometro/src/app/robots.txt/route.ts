// GET /robots.txt: bots are welcome; the sitemap and feed say where the data is.
import { baseUrlFrom, isAgentReady } from "@/shared/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = baseUrlFrom(req.headers);
  const lines = ["User-agent: *", "Allow: /"];
  if (isAgentReady()) lines.push(`Sitemap: ${base}/sitemap.xml`, `# Product feed: ${base}/feed.xml`, `# UCP profile: ${base}/.well-known/ucp`);
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain" } });
}
