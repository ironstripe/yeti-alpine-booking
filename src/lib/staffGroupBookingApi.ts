// Client for the staff-only `staff-group-booking` Edge Function (26/27 group courses).
import { supabase } from "@/integrations/supabase/client";
import type { ServerGroupOption } from "@/lib/groupCoursePlan";
import type { StaffFinalization } from "@/lib/privateAppointmentsApi";

export type StaffGroupOptionsResult =
  | { status: "installed"; options: ServerGroupOption[] }
  | { status: "not_installed" }
  | { status: "error" };

/** 404 from the gateway = function not deployed; installed:false = SQL not installed. Anything else is an error, never "not installed". */
export async function fetchStaffGroupOptions(dates: string[], sport: "ski" | "snowboard"): Promise<StaffGroupOptionsResult> {
  const { data, error } = await supabase.functions.invoke("staff-group-booking", { body: { action: "options", dates, sport } });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    return status === 404 ? { status: "not_installed" } : { status: "error" };
  }
  if (data?.installed === false) return { status: "not_installed" };
  if (data?.installed === true && Array.isArray(data.options)) return { status: "installed", options: data.options };
  return { status: "error" };
}

export interface StaffGroupLine {
  course_id: string;
  product_id: string;
  dates: string[];
  block: "am" | "pm" | null;
  sport: "ski" | "snowboard";
  expected_unit_price: number;
  /** Course value when set, else the explicit office choice (server re-validates). */
  meeting_point: string;
  lunch_dates?: string[];
  vegetarian?: boolean;
  expected_lunch_unit_price?: number;
  participant_id?: string;
  guest?: { guest_key: string; first_name: string; last_name?: string; birth_date: string; sport?: string; level?: string };
}

export interface StaffGroupBookingResult { ticket_id: string; ticket_number: string; total: number; replayed?: boolean }

const FIELD_MESSAGES: Record<string, string> = {
  course: "Der Kurs ist nicht (mehr) buchbar – bitte Kurs neu wählen.",
  participant: "Ein Teilnehmer gehört nicht zu diesem Kunden.",
  level: "Das gewählte Niveau passt nicht zur Sportart eines neuen Teilnehmers. Bitte Niveau prüfen. Es wurde nichts gespeichert.",
  dates: "Die Kurstage passen nicht zum Kursangebot.",
  blocks: "Die Kurszeiten haben sich geändert – bitte Kurs neu wählen.",
  duplicate: "Ein Teilnehmer ist doppelt im selben Kurs.",
  already_enrolled: "Ein Teilnehmer ist in diesem Kurs bereits angemeldet.",
  price_changed: "Der Tarif hat sich geändert – bitte Kurs neu wählen und Preis prüfen.",
  tariff: "Für diese Auswahl gibt es keinen exakten Winter-26/27-Tarif.",
  customer_id: "Kunde nicht gefunden.",
  meeting_point: "Treffpunkt fehlt oder ist ungültig – bitte Treffpunkt wählen.",
  lunch: "Mittagsbetreuung nur an gebuchten Kurstagen möglich.",
  lunch_price_changed: "Der Preis der Mittagsbetreuung hat sich geändert – bitte prüfen.",
  lunch_product: "Für die Mittagsbetreuung ist kein eindeutiger Preis hinterlegt.",
  line_shape: "Ungültige Buchungsdaten – bitte Kurs neu wählen.",
  payment_method: "Ungültige Zahlungsart.",
  billing_partner_id: "Bitte das Hotel wählen, das die Rechnung übernimmt.",
  settlement: "Ungültige Zahlungsangabe.",
  finalization: "Ungültige Zahlungs- oder Notizangaben.",
  discount_percent: "Rabatt muss zwischen 0 und 100 % liegen.",
  discount_reason: "Bitte einen Grund für den Rabatt angeben.",
};

/**
 * Throws with an honest message. `unknown: true` means the outcome is unknown (network/5xx):
 * the caller must not claim that nothing was saved; a retry with the same key is safe.
 */
export async function createStaffGroupBooking(payload: { submission_key: string; customer_id: string; notes?: string; lines: StaffGroupLine[]; discount_percent?: number; discount_reason?: string; finalization?: StaffFinalization }): Promise<StaffGroupBookingResult> {
  const { data, error } = await supabase.functions.invoke("staff-group-booking", { body: { action: "create", booking: payload } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let body: { error?: string; field?: string } | null = null;
    try { body = ctx && typeof ctx.json === "function" ? await ctx.clone().json() : null; } catch { body = null; }
    if (ctx?.status === 422 || ctx?.status === 404) {
      throw new Error(FIELD_MESSAGES[body?.field ?? ""] ?? "Die Buchung wurde vom Server abgelehnt. Es wurde nichts gespeichert.");
    }
    if (ctx?.status === 503 || body?.error === "not_installed") throw new Error("Die Gruppenbuchung Winter 26/27 ist auf dem Server noch nicht installiert. Es wurde nichts gespeichert.");
    if (ctx?.status === 401 || ctx?.status === 403) throw new Error("Keine Berechtigung für Gruppenbuchungen. Es wurde nichts gespeichert.");
    throw Object.assign(new Error("Ergebnis unbekannt: Die Verbindung wurde unterbrochen. Bitte Buchungsliste prüfen oder erneut senden – eine Wiederholung erzeugt keine doppelte Buchung."), { unknown: true });
  }
  if (!data?.ticket_id) throw new Error("Unerwartete Serverantwort. Bitte Buchungsliste prüfen.");
  return data as StaffGroupBookingResult;
}
