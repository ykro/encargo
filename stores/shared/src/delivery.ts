// Delivery dates from published business days. Both the store (checkout
// fulfillment options) and the agent compute arrival the same way:
// arrival = today (Guatemala time) + max handling + max transit business days.

const GT_OFFSET_MS = -6 * 3600_000; // America/Guatemala, no daylight saving

export function todayInGuatemala(now = Date.now()): Date {
  const local = new Date(now + GT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const spanishDate = (d: Date) => `${DAYS_ES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]}`;
