// Client for the staff-only `private-appointments` Edge Function.
// All private-lesson create/move/period changes go through it (no direct table writes).
import { supabase } from "@/integrations/supabase/client";
import type { EditQuote, EditRequest } from "@/lib/canonicalPrivateEdit";
import { TARIFF_UNAVAILABLE_REASONS } from "@/lib/privateTariffRules";
import { describeMoveQuote, isMoveQuote } from "@/lib/privateMoveQuote";

export interface PaConflict { index?: number; date?: string; kind?: string; ref_id?: string }
export interface PaExcluded { id: string; reasons: string[] }

export class PrivateAppointmentError extends Error {
  constructor(
    public status: number,
    public code: string,
    public conflicts: PaConflict[] = [],
    public excluded: PaExcluded[] = [],
    public field: string | null = null,
    public quote: unknown = null,
  ) {
    super(describe(code, conflicts, excluded, field));
  }
  /** Network/5xx: the server may or may not have saved; retry with the same key is safe. */
  get unknown() { return this.status >= 500 || this.status === 0; }
}

const REASONS: Record<string, string> = {
  past: "liegt in der Vergangenheit",
  completed: "ist abgeschlossen",
  invoiced: "ist bereits verrechnet",
};

const FIELDS: Record<string, string> = {
  client_outdated: "Diese Seite ist veraltet (Preisregeln wurden aktualisiert). Bitte die Seite neu laden und die Buchung erneut prüfen.",
  birth_date: "Das Geburtsdatum eines neuen Teilnehmers ist ungültig oder liegt in der Zukunft. Bitte prüfen.",
  level: "Das gewählte Niveau passt nicht zur Sportart eines neuen Teilnehmers. Bitte Niveau prüfen.",
  participants: "Ein Teilnehmer gehört nicht zum gewählten Kunden oder es fehlen Angaben (Vorname, Geburtsdatum). Bitte Teilnehmer prüfen.",
  customer_id: "Kunde nicht gefunden.",
  appointments: "Ein Termin ist ungültig (Datum/Zeit/Lehrperson).",
  discount_reason: "Bitte einen Grund für den Rabatt angeben.",
  discount_percent: "Rabatt muss zwischen 0 und 100 % liegen.",
  discount_override: "Manueller Rabatt ungültig (Grund fehlt oder doppelt angegeben).",
  discount_rule_revision: "Der Preis muss zuerst in der Zusammenfassung geprüft werden.",
  payment_method: "Ungültige Zahlungsart.",
  billing_partner_id: "Bitte das Hotel wählen, das die Rechnung übernimmt.",
  settlement: "Ungültige Zahlungsangabe.",
  finalization: "Ungültige Zahlungs- oder Notizangaben.",
};

function describe(code: string, conflicts: PaConflict[], excluded: PaExcluded[], field: string | null = null): string {
  switch (code) {
    case "conflict": {
      const days = [...new Set(conflicts.map((c) => c.date).filter(Boolean))].join(", ");
      if (conflicts.some((c) => c.kind === "stale")) return "Die Buchung wurde inzwischen geändert. Bitte neu laden. Es wurde nichts gespeichert.";
      return `Zeitfenster nicht frei${days ? ` (${days})` : ""}. Es wurde nichts geändert.`;
    }
    case "protected": {
      const r = [...new Set(excluded.flatMap((e) => e.reasons.map((x) => REASONS[x] ?? x)))].join(", ");
      return `Termin geschützt${r ? `: ${r}` : ""}. Es wurde nichts geändert.`;
    }
    case "forbidden": return "Keine Berechtigung für diese Änderung.";
    case "quote_changed": return "Der Preis hat sich seit der Vorschau geändert. Bitte neuen Preis prüfen und erneut bestätigen. Es wurde nichts gespeichert.";
    case "unavailable": return "Bearbeiten bestehender Privatlektionen ist noch nicht freigeschaltet. Es wurde nichts gespeichert.";
    case "tariff_unavailable": return `${(field && TARIFF_UNAVAILABLE_REASONS[field]) || "Kein gültiger Produkttarif."} Es wurde nichts gespeichert.`;
    case "tariff_transition_required": return "Diese Privatlektion wurde mit Produkttarif und Rabatt berechnet. Zeit- oder Teilnehmeränderungen sind dafür noch nicht freigeschaltet (nur Lehrperson, Notizen, Treffpunkt). Es wurde nichts geändert.";
    case "price_declined": return "Neuer Preis nicht bestätigt. Es wurde nichts geändert.";
    case "not_found": return "Termin nicht gefunden.";
    case "invalid": return `${(field && FIELDS[field]) || "Ungültige Angaben."} Es wurde nichts gespeichert.`;
    default: return "Ergebnis unbekannt: Bitte Buchungsliste prüfen oder erneut senden – eine Wiederholung erzeugt keine doppelte Buchung.";
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("private-appointments", { body });
  if (!error) return data as T;
  // FunctionsHttpError carries the Response in `context`
  const res = (error as { context?: Response }).context;
  let payload: Record<string, unknown> = {};
  let status = 500;
  if (res && typeof res.json === "function") {
    status = res.status;
    try { payload = await res.json(); } catch { /* keep empty */ }
  }
  // An older deployed function rejects the unknown `edit` action by schema: report unavailability,
  // never an ambiguous result or a fallback to direct writes.
  const fields = payload.fields as Record<string, unknown> | undefined;
  const code = body.action === "edit" && status === 400 && fields && "action" in fields ? "unavailable" : String(payload.error ?? "internal_error");
  throw new PrivateAppointmentError(
    status,
    code,
    (payload.conflicts as PaConflict[]) ?? [],
    (payload.excluded as PaExcluded[]) ?? [],
    typeof payload.field === "string" ? payload.field : typeof payload.reason === "string" ? payload.reason : null,
    payload.quote ?? null,
  );
}

/** Office settlement/notes applied in the same server transaction as the booking. */
export interface StaffFinalization {
  payment_method: string | null;
  settlement: "paid_now" | "pay_later";
  billing_partner_id: string | null;
  payment_due_date: string | null;
  internal_notes?: string;
  instructor_notes?: string;
  conversation_id?: string;
}

export type PaParticipant =
  | { participant_id: string }
  | { guest_key: string; first_name: string; last_name?: string; birth_date: string; sport?: "ski" | "snowboard"; level?: string };

/** A real teacher, or the explicit "Später zuweisen" intent (never a missing/fake teacher). */
export type PaSlot =
  | { date: string; time_start: string; time_end: string; instructor_id: string; meeting_point?: string }
  | { date: string; time_start: string; time_end: string; assign_later: true; meeting_point?: string };

export const paCreate = (p: {
  submission_key: string; customer_id: string; product_id: string; notes?: string;
  appointments: PaSlot[]; participants: PaParticipant[];
  discount_percent?: number; discount_reason?: string;
  finalization?: StaffFinalization;
  confirmation_requested?: boolean;
  quote_revision?: number;
  discount_rule_revision?: number;
  discount_override?: DiscountOverride;
  day_context_digest?: string;
}) => call<{ ticket_id: string; ticket_number: string; appointment_ids: string[]; total: number; replayed?: boolean }>(
  { action: "create", ...p },
);

export type ConfirmPrice = (text: string) => boolean | Promise<boolean>;
/** Registered by <PriceAckDialogHost/> (accessible app dialog). Without a host: fail closed (declined). */
let priceAckHost: ConfirmPrice | null = null;
export function registerPriceAckHost(fn: ConfirmPrice | null) { priceAckHost = fn; }
const appConfirm: ConfirmPrice = (text) => (priceAckHost ? priceAckHost(text) : false);

/** L1: if the server requotes the price, ask once and re-send bound to exactly that quote. */
export async function withPriceAck<T>(body: Record<string, unknown>, confirm: ConfirmPrice = appConfirm): Promise<T> {
  try {
    return await call<T>(body);
  } catch (e) {
    if (!(e instanceof PrivateAppointmentError) || e.code !== "quote_changed" || !isMoveQuote(e.quote)) throw e;
    if (!(await confirm(describeMoveQuote(e.quote)))) throw new PrivateAppointmentError(409, "price_declined");
    return await call<T>({ ...body, acknowledged_quote_digest: e.quote.quote_digest });
  }
}

/** R1: exactly one of a teacher or explicit assign_later (only accepted for an already unassigned lesson). */
export type PaMoveInput = { appointment_id: string; date: string; time_start: string; time_end: string }
  & ({ instructor_id: string; assign_later?: undefined } | { assign_later: true; instructor_id?: undefined });
export const paMove = (p: PaMoveInput, confirm?: ConfirmPrice) =>
  withPriceAck<{ price: number; confirmation_reset: boolean }>({ action: "move", ...p }, confirm);

export const paPeriodUpdate = (p: {
  period_group_id: string; changes: { time_start?: string; time_end?: string; instructor_id?: string };
}, confirm?: ConfirmPrice) => withPriceAck<{ updated_ids: string[]; excluded: PaExcluded[] }>({ action: "period_update", ...p }, confirm);

/** B03a: server quote / atomic apply for edits of an existing canonical private booking. */
export const paEditQuote = (p: EditRequest) =>
  call<{ quote: EditQuote }>({ action: "edit", mode: "quote", ...p });
export const paEditApply = (p: EditRequest) =>
  call<{ changed: boolean; quote: EditQuote; total?: number }>({ action: "edit", mode: "apply", ...p });

/** B07-P/P2: server preview of a new office private booking (same resolver + discount as create). */
export type DiscountSource = "none" | "automatic" | "manual";
export interface CreateQuoteItem {
  index: number; price: number; mode: string; persons: number; eligible: number;
  automatic_discount_amount: number; discount_source: DiscountSource; discount_percent: number;
  discount_reason: string | null; discount_amount: number; net: number;
}
export interface CreateQuote {
  revision: number; discount_rule_revision: number; total: number; gross_total: number;
  discount_total: number; automatic_discount_total: number; discount_source: DiscountSource;
  discount_rule: { percent: number; threshold_minutes: number };
  items: CreateQuoteItem[];
  /** B07-P3: binds create to the already booked same-day lessons this quote counted. */
  day_context_digest: string;
  existing_appointments: number;
}
export interface DiscountOverride { percent: number; reason?: string }
export const paCreateQuote = (p: {
  product_id: string; persons: number;
  customer_id?: string; participant_ids?: string[];
  appointments: { date: string; time_start: string; time_end: string }[];
  discount_override?: DiscountOverride;
}) => call<CreateQuote>({ action: "quote", ...p });
