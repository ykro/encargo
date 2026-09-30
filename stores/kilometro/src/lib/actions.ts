"use server";
// Cart actions (server actions): they work with plain HTML forms, no JavaScript needed.
import { redirect } from "next/navigation";
import { findVariant } from "@/shared/db";
import { readCart, writeCart } from "./cart";

export async function addToCart(formData: FormData): Promise<void> {
  const variantId = String(formData.get("variantId") ?? "");
  const found = findVariant(variantId);
  if (!found || found.variant.stock < 1) redirect(`/carrito?error=agotado`);
  const lines = await readCart();
  const existing = lines.find((l) => l.variantId === variantId);
  if (existing) existing.qty = Math.min(existing.qty + 1, found.variant.stock);
  else lines.push({ variantId, qty: 1 });
  await writeCart(lines);
  redirect(`/carrito?agregado=${encodeURIComponent(variantId)}`);
}

export async function removeFromCart(formData: FormData): Promise<void> {
  const variantId = String(formData.get("variantId") ?? "");
  await writeCart((await readCart()).filter((l) => l.variantId !== variantId));
  redirect("/carrito");
}

export async function placeOrder(): Promise<void> {
  // Human checkout is simulated in this demo: no card, no stock movement.
  const ref = `KM-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await writeCart([]);
  redirect(`/carrito?pedido=${ref}`);
}
