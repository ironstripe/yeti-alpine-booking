// B07b client for the staff `office-booking` endpoint (atomic multi-item quote/create).
import { supabase } from "@/integrations/supabase/client";
import { privateTariffsLive } from "@/lib/privateTariffRules";
import type { OfficeCart } from "@/lib/officeCartRequest";

/** Release switch: OFF until b07a_office_multi + office-booking are installed/deployed together with B07. */
export const OFFICE_MULTI_ITEM_LIVE = false;
export function officeMultiItemLive(): boolean {
  if (!privateTariffsLive()) return false;
  if (OFFICE_MULTI_ITEM_LIVE) return true;
  if (!import.meta.env.DEV) return false;
  try { return globalThis.localStorage?.getItem("yeti.officeMultiPreview") === "1"; } catch { return false; }
}

export interface OfficeQuoteLine {
  item_type: string; product_id: string; date: string | null; end_date: string | null; time_start: string | null; time_end: string | null;
  instructor_id: string | null; unit_price: number; discount_percent: number | null; discount_reason: string | null;
  line_total: number | null; group_name: string | null; item: number | null; participants: string[]; is_vegetarian?: boolean | null;
}
export interface OfficeQuotePrivate {
  item: number; index: number; date: string; time_start: string; time_end: string; participants: string[];
  gross: number; discount_source: "none" | "automatic" | "manual"; discount_percent: number; discount_reason: string | null;
  persons: number; eligible: number; net: number;
}
export interface OfficeQuote {
  lines: OfficeQuoteLine[]; private: OfficeQuotePrivate[]; total: number; quote_digest: string;
  existing_same_day_appointments: number; tariff_revisions?: unknown; discount_rule_revision?: number | null;
}
export interface OfficeCreateResult { ticket_id: string; ticket_number: string; total: number; replayed?: boolean; quote_digest: string }

export class OfficeBookingError extends Error {
  constructor(public status: number, public code: string, public detail: Record<string, unknown> = {}, public unknown = false) {
    super(officeErrorMessage(code, detail, unknown));
  }
}

const FIELD: Record<string, string> = {
  birth_date: "Ungültiges Geburtsdatum.", participants: "Teilnehmer ungültig oder doppelt erfasst.",
  participant_overlap: "Eine Person wäre zur gleichen Zeit in zwei Unterrichten.", meeting_point: "Treffpunkt fehlt oder ist ungültig.",
  billing_partner_id: "Hotel/Partner für die Abrechnung fehlt.", lunch: "Mittagessen ist nur bei Ganztageskursen möglich.",
  group_discount: "Unterschiedliche Gruppenrabatte in einer Buchung sind nicht möglich.", items: "Warenkorb ungültig.",
};
export function officeErrorMessage(code: string, d: Record<string, unknown> = {}, unknown = false): string {
  const pos = typeof d.item === "number" ? ` (Position ${d.item + 1})` : "";
  if (unknown) return "Ergebnis unbekannt: Bitte Buchungsliste prüfen oder erneut senden – eine Wiederholung erzeugt keine doppelte Buchung.";
  switch (code) {
    case "quote_changed": return "Der Preis hat sich seit der Vorschau geändert. Bitte neuen Preis prüfen und erneut bestätigen. Es wurde nichts gespeichert.";
    case "submission_mismatch": return "Diese Buchung wurde bereits mit anderen Angaben gesendet. Bitte Buchungsliste prüfen; für neue Angaben den Assistenten neu starten. Es wurde nichts zusätzlich gespeichert.";
    case "conflict": return "Mindestens ein Termin ist nicht mehr frei. Es wurde nichts gespeichert.";
    case "tariff_unavailable": return `Für ein Produkt ist kein gültiger Privatunterricht-Tarif hinterlegt${pos}. Es wurde nichts gespeichert.`;
    case "unavailable": return "Gemeinsames Speichern mehrerer Unterrichte ist noch nicht freigeschaltet. Es wurde nichts gespeichert.";
    case "forbidden": return "Keine Berechtigung. Es wurde nichts gespeichert.";
    case "not_found": return `Ein gewählter Eintrag existiert nicht mehr${pos}. Es wurde nichts gespeichert.`;
    case "invalid": return `${(typeof d.field === "string" && FIELD[d.field]) || "Ungültige Angaben."}${pos} Es wurde nichts gespeichert.`;
    default: return "Ergebnis unbekannt: Bitte Buchungsliste prüfen oder erneut senden – eine Wiederholung erzeugt keine doppelte Buchung.";
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  let res;
  try { res = await supabase.functions.invoke("office-booking", { body }); }
  catch { throw new OfficeBookingError(0, "network", {}, body.action === "create"); }
  const { data, error } = res;
  if (!error) return data as T;
  const ctx = (error as { context?: Response }).context;
  let payload: Record<string, unknown> = {}; let status = 0;
  if (ctx && typeof ctx.json === "function") { status = ctx.status; try { payload = await ctx.json(); } catch { /* keep */ } }
  const code = String(payload.error ?? "internal_error");
  // Only a create whose outcome is not a definite rejection is "unknown" (may have been saved).
  const unknown = body.action === "create" && (status === 0 || status >= 500) && code !== "unavailable";
  throw new OfficeBookingError(status, code, payload, unknown);
}

export const officeQuote = (submission_key: string, cart: OfficeCart) =>
  call<{ quote: OfficeQuote }>({ action: "quote", submission_key, ...cart });
export const officeCreate = (submission_key: string, cart: OfficeCart, acknowledged_quote_digest: string, confirmation_requested: boolean) =>
  call<OfficeCreateResult>({ action: "create", submission_key, ...cart, acknowledged_quote_digest, confirmation_requested });
