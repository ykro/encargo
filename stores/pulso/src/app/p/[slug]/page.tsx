// Product page. Normally an empty shell rendered in the browser. In control
// mode (PULSO_AGENT_READY) the server also sends the same schema.org JSON-LD
// Kilómetro publishes — the only difference the agent is allowed to notice.
import { headers } from "next/headers";
import { listProducts } from "@/shared/db";
import { jsonLdScript, productJsonLd } from "@/shared/schemaOrg";
import { baseUrlFrom, isAgentReady, productPath, pulsoRef } from "@/shared/store";
import { ProductView } from "@/components/ProductView";

export const dynamic = "force-dynamic";

export default async function PulsoProduct({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: ref } = await params;
  const product = isAgentReady() ? listProducts().find((p) => pulsoRef(p.slug) === ref) : undefined;
  const base = product ? baseUrlFrom(await headers()) : "";
  return (
    <>
      {product && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(product, base, productPath(product.slug))) }}
        />
      )}
      <ProductView slug={ref} />
    </>
  );
}
