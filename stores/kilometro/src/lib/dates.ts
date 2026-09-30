// Delivery wording for people. Same rule the agent uses: today in Guatemala
// + maximum handling + maximum transit, counted in business days.
import type { Product } from "@/shared/catalog";
import { addBusinessDays, todayInGuatemala } from "@/shared/delivery";

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function arrivalDate(p: Product): Date {
  return addBusinessDays(todayInGuatemala(), p.shipping.handlingDays[1] + p.shipping.transitDays[1]);
}

export function longDate(d: Date): string {
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

export function arrivalLabel(p: Product): string {
  return `Llega el ${longDate(arrivalDate(p))}`;
}

export function shippingLabel(p: Product): string {
  return p.shipping.rateCents === 0 ? "Envío gratis" : `Envío ${(p.shipping.rateCents / 100).toFixed(2)} USD`;
}
