// Builds the tiny client-side catalog Pulso's pages render from. It carries only
// what the visual UI needs — an opaque reference, a picture and the sizes —
// because in Pulso the name and the price live inside the pictures, not in data.
// Pictures are published under opaque names (no model slugs in any URL).
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

const publish = (source, token) => {
  if (!existsSync(source)) return null;
  copyFileSync(source, `public/v/${token}.jpg`);
  return `/v/${token}.jpg`;
};

const items = catalog.models.map((m) => {
  const s = m.stores.pulso;
  const token = ref(m.slug);
  return {
    ref: token,
    image: publish(`../../catalog/${m.pulso_image}`, token) ?? `/v/${token}.jpg`,
    sizes: m.sizes.map((size) => ({ size, available: (s.stock[size] ?? 0) > 0 })),
    deliveryDays: s.handling_business_days[1] + s.transit_business_days[1],
  };
});
const hero = publish("../../catalog/images/pulso/hero.jpg", ref("pulso-hero"));

// The slugged originals are for Kilómetro and the JSON-LD of control mode;
// Pulso never serves its own ads under readable names.
rmSync("public/images/pulso", { recursive: true, force: true });

// The hero features the first model of the catalog; it links to that product.
const heroRef = ref(catalog.models[0].slug);
writeFileSync("src/vitrina.json", JSON.stringify({ hero, heroRef, items }));
console.log(`vitrina: ${items.length} products${hero ? " + hero" : ""}`);
