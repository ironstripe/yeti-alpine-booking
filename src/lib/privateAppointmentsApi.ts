// Client for the staff-only `private-appointments` Edge Function.
// All private-lesson create/move/period changes go through it (no direct table writes).
import { supabase } from "@/integrations/supabase/client";

export interface PaConflict { index?: number; date?: string; kind?: string; ref_id?: string }
export interface PaExcluded { id: string; reasons: string[] }

export class PrivateAppointmentError extends Error {
  constructor(
    public status: number,
    public code: string,
    public conflicts: PaConflict[] = [],
    public excluded: PaExcluded[] = [],
    public field: string | null = null,
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
  level: "Das gewählte Niveau passt nicht zur Sportart eines neuen Teilnehmers. Bitte Niveau prüfen.",
  participants: "Ein Teilnehmer gehört nicht zum gewählten Kunden oder es fehlen Angaben (Vorname, Geburtsdatum). Bitte Teilnehmer prüfen.",
  customer_id: "Kunde nicht gefunden.",
  appointments: "Ein Termin ist ungültig (Datum/Zeit/Lehrperson).",
  discount_reason: "Bitte einen Grund für den Rabatt angeben.",
  discount_percent: "Rabatt muss zwischen 0 und 100 % liegen.",
  payment_method: "Ungültige Zahlungsart.",
  billing_partner_id: "Bitte das Hotel wählen, das die Rechnung übernimmt.",
  settlement: "Ungültige Zahlungsangabe.",
  finalization: "Ungültige Zahlungs- oder Notizangaben.",
};

function describe(code: string, conflicts: PaConflict[], excluded: PaExcluded[], field: string | null = null): string {
  switch (code) {
    case "conflict": {
      const days = [...new Set(conflicts.map((c) => c.date).filter(Boolean))].join(", ");
      return `Zeitfenster nicht frei${days ? ` (${days})` : ""}. Es wurde nichts geändert.`;
    }
    case "protected": {
      const r = [...new Set(excluded.flatMap((e) => e.reasons.map((x) => REASONS[x] ?? x)))].join(", ");
      return `Termin geschützt${r ? `: ${r}` : ""}. Es wurde nichts geändert.`;
    }
    case "forbidden": return "Keine Berechtigung für diese Änderung.";
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
  throw new PrivateAppointmentError(
    status,
    String(payload.error ?? "internal_error"),
    (payload.conflicts as PaConflict[]) ?? [],
    (payload.excluded as PaExcluded[]) ?? [],
    typeof payload.field === "string" ? payload.field : null,
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
}) => call<{ ticket_id: string; ticket_number: string; appointment_ids: string[]; total: number; replayed?: boolean }>(
  { action: "create", ...p },
);

export const paMove = (p: { appointment_id: string; date: string; time_start: string; time_end: string; instructor_id: string }) =>
  call<{ price: number; confirmation_reset: boolean }>({ action: "move", ...p });

export const paPeriodUpdate = (p: {
  period_group_id: string; changes: { time_start?: string; time_end?: string; instructor_id?: string };
}) => call<{ updated_ids: string[]; excluded: PaExcluded[] }>({ action: "period_update", ...p });
