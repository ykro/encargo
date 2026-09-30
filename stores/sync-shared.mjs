#!/usr/bin/env node
// Copies the shared commerce kit and the seed catalog into a store.
//
// Why copy instead of a workspace package: each store is built on its own by
// Cloud Build (one Dockerfile per service), so everything it needs must live
// inside its folder. The copies are generated (gitignored); the source of
// truth is stores/shared/ and catalog/.
//
//   node ../sync-shared.mjs            (run from stores/<store>/)
//   node ../sync-shared.mjs --kit-only (run from stores/shared/: catalog only)
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const storesDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(storesDir, "..");
const kitSrc = join(storesDir, "shared", "src");
const catalogJson = join(repoDir, "catalog", "catalog.json");
const imagesDir = join(repoDir, "catalog", "images");

// The kit reads the catalog from src/data/catalog.json wherever it lives.
mkdirSync(join(kitSrc, "data"), { recursive: true });
cpSync(catalogJson, join(kitSrc, "data", "catalog.json"));

if (process.argv.includes("--kit-only")) process.exit(0);

const storeDir = process.cwd();
const target = join(storeDir, "src", "shared");
rmSync(target, { recursive: true, force: true });
cpSync(kitSrc, target, { recursive: true });

if (existsSync(imagesDir)) {
  const publicImages = join(storeDir, "public", "images");
  rmSync(publicImages, { recursive: true, force: true });
  // Prompts stay with the source assets; stores only serve the pictures.
  cpSync(imagesDir, publicImages, {
    recursive: true,
    filter: (src) => !src.endsWith(".json"),
  });
}
console.log(`synced commerce kit + catalog into ${target}`);
