// A person's cart lives in a cookie: variant ids and quantities, nothing else.
// Prices and stock are always read fresh from the store's database.
import { cookies } from "next/headers";
import { findVariant } from "@/shared/db";

const COOKIE = "km_carrito";

export interface CartLine {
  variantId: string;
  qty: number;
}

export async function readCart(): Promise<CartLine[]> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const lines = JSON.parse(raw) as CartLine[];
    return lines.filter((l) => typeof l.variantId === "string" && l.qty > 0 && findVariant(l.variantId));
  } catch {
    return [];
  }
}

export async function writeCart(lines: CartLine[]): Promise<void> {
  (await cookies()).set(COOKIE, JSON.stringify(lines), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 7 });
}

export async function cartCount(): Promise<number> {
  return (await readCart()).reduce((n, l) => n + l.qty, 0);
}

export async function cartDetails() {
  const lines = await readCart();
  return lines.map((l) => {
    const found = findVariant(l.variantId)!;
    return { ...l, product: found.product, variant: found.variant, subtotalCents: found.product.priceCents * l.qty };
  });
}
