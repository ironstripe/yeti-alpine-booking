// L1: a move / period change of a tariff-priced private lesson that changes its price returns the
// server quote (quote_changed). The user confirms exactly that quote; the request is then re-sent with
// its digest. Nothing is saved before the confirmation; a changed quote on retry is reported, not guessed.
export interface MoveQuoteItem {
  appointment_id: string; date: string; time_start: string; time_end: string;
  gross: number; discount_percent: number; net: number; old_gross: number; old_net: number; price_changed: boolean;
}
export interface MoveQuote { items: MoveQuoteItem[]; old_total: number; new_total: number; quote_digest: string; price_changed: boolean }

export function isMoveQuote(q: unknown): q is MoveQuote {
  const x = q as MoveQuote | null;
  return !!x && typeof x.quote_digest === "string" && /^[0-9a-f]{32}$/.test(x.quote_digest) && Array.isArray(x.items)
    && typeof x.old_total === "number" && typeof x.new_total === "number";
}

const chf = (n: number) => `CHF ${Number(n).toFixed(2)}`;
const day = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}.${m}.${y}`; };

/** German confirmation text listing only lessons whose price changes. */
export function describeMoveQuote(q: MoveQuote): string {
  const lines = q.items.filter((i) => i.price_changed).map((i) => {
    const disc = Number(i.discount_percent) > 0 ? ` (inkl. ${Number(i.discount_percent).toFixed(2).replace(/\.?0+$/, "")} % Rabatt)` : "";
    return `• ${day(i.date)} ${i.time_start.slice(0, 5)}–${i.time_end.slice(0, 5)}: ${chf(i.old_net)} → ${chf(i.net)}${disc}`;
  });
  return [
    "Diese Änderung ändert den Preis:",
    ...lines,
    `Total Buchung: ${chf(q.old_total)} → ${chf(q.new_total)}`,
    "Frühere separate Buchungen werden nicht neu berechnet. Änderung mit diesem Preis speichern?",
  ].join("\n");
}
