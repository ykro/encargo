// Builds the tiny client-side catalog Pulso's pages render from. It carries only
// what the visual UI needs — an opaque reference, a picture and the sizes —
// because in Pulso the name and the price live inside the pictures, not in data.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// Same FNV-1a token as pulsoRef() in shared/src/store.ts.
const ref = (slug) => {
  let h = 2166136261;
  for (const c of slug) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
};

const catalog = JSON.parse(readFileSync("src/shared/data/catalog.json", "utf8"));
rmSync("public/v", { recursive: true, force: true });
mkdirSync("public/v", { recursive: true });
const vitrina = catalog.models.map((m) => {
  const s = m.stores.pulso;
  const token = ref(m.slug);
  const source = `../../catalog/${m.pulso_image}`;
  if (existsSync(source)) copyFileSync(source, `public/v/${token}.jpg`);
  return {
    ref: token,
    image: `/v/${token}.jpg`,
    sizes: m.sizes.map((size) => ({ size, available: (s.stock[size] ?? 0) > 0 })),
    deliveryDays: s.handling_business_days[1] + s.transit_business_days[1],
  };
});
writeFileSync("src/vitrina.json", JSON.stringify(vitrina));
console.log(`vitrina: ${vitrina.length} products`);
