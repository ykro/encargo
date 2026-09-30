// Store state in SQLite: live stock, carts, checkout sessions and orders.
// The database is seeded on first use and fully rebuilt by resetStore(), which
// is what `make reset` calls through the admin endpoint.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedModels, seedStock, toProduct, type Product } from "./catalog";
import { currentStore } from "./store";

const g = globalThis as unknown as { __storeDb?: DatabaseSync };

function dbPath(): string {
  return process.env.DB_PATH ?? `./.data/${currentStore().key}.db`;
}

export function db(): DatabaseSync {
  if (g.__storeDb) return g.__storeDb;
  const path = dbPath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const conn = new DatabaseSync(path);
  conn.exec(`
    CREATE TABLE IF NOT EXISTS stock (variant_id TEXT PRIMARY KEY, product_id TEXT, size TEXT, qty INTEGER);
    CREATE TABLE IF NOT EXISTS carts (id TEXT PRIMARY KEY, body TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS checkouts (id TEXT PRIMARY KEY, body TEXT, status TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, checkout_id TEXT, body TEXT, created_at TEXT);
  `);
  g.__storeDb = conn;
  const count = conn.prepare("SELECT COUNT(*) AS n FROM stock").get() as { n: number };
  if (count.n === 0) seedDb(conn);
  return conn;
}

function seedDb(conn: DatabaseSync): void {
  const insert = conn.prepare("INSERT INTO stock (variant_id, product_id, size, qty) VALUES (?, ?, ?, ?)");
  for (const row of seedStock(currentStore().key)) insert.run(row.variantId, row.productId, row.size, row.qty);
}

/** Back to the initial state: seed stock, no carts, no checkouts, no orders. */
export function resetStore(): void {
  const conn = db();
  conn.exec("DELETE FROM stock; DELETE FROM carts; DELETE FROM checkouts; DELETE FROM orders;");
  seedDb(conn);
}

export function stockOf(variantId: string): number {
  const row = db().prepare("SELECT qty FROM stock WHERE variant_id = ?").get(variantId) as { qty: number } | undefined;
  return row?.qty ?? 0;
}

export function listProducts(): Product[] {
  const store = currentStore().key;
  return seedModels.map((m) => toProduct(m, store, stockOf));
}

export function productBySlug(slug: string): Product | undefined {
  return listProducts().find((p) => p.slug === slug);
}

export function findVariant(variantId: string): { product: Product; variant: Product["variants"][number] } | undefined {
  for (const product of listProducts()) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  // A product id alone resolves to nothing: a shoe needs a size.
  return undefined;
}

/** Decrements stock atomically; false when there is not enough. */
export function takeStock(variantId: string, qty: number): boolean {
  const result = db()
    .prepare("UPDATE stock SET qty = qty - ? WHERE variant_id = ? AND qty >= ?")
    .run(qty, variantId, qty);
  return Number(result.changes) === 1;
}

type Table = "carts" | "checkouts";

export function saveDoc(table: Table, id: string, body: unknown, status?: string): void {
  const now = new Date().toISOString();
  if (table === "checkouts") {
    db()
      .prepare(
        "INSERT INTO checkouts (id, body, status, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, status = excluded.status",
      )
      .run(id, JSON.stringify(body), status ?? "", now);
  } else {
    db()
      .prepare("INSERT INTO carts (id, body, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body")
      .run(id, JSON.stringify(body), now);
  }
}

export function loadDoc<T>(table: Table, id: string): T | undefined {
  const row = db().prepare(`SELECT body FROM ${table} WHERE id = ?`).get(id) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as T) : undefined;
}

export function saveOrder(id: string, checkoutId: string, body: unknown): void {
  db()
    .prepare("INSERT INTO orders (id, checkout_id, body, created_at) VALUES (?, ?, ?, ?)")
    .run(id, checkoutId, JSON.stringify(body), new Date().toISOString());
}

export function listOrders(): unknown[] {
  return (db().prepare("SELECT body FROM orders ORDER BY created_at").all() as { body: string }[]).map((r) =>
    JSON.parse(r.body),
  );
}
