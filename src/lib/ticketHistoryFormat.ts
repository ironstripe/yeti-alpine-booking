// B11: pure, display-only texts for ticket_history events. Amounts come ONLY from the event's own
// persisted payload (never today's ticket total). Missing values are shown as "nicht protokolliert",
// a stored 0 stays CHF 0.00. Unknown events fall back to a neutral label with the raw type.
export interface HistoryEventLike {
  id: string;
  created_at: string;
  event_type: string;
  details: Record<string, unknown> | null;
}

const EVENT_LABELS: Record<string, string> = {
  BOOKING_CREATED: "Buchung erstellt",
  GROUP_BOOKING_CREATED: "Gruppenbuchung angelegt",
  STATUS_CHANGED: "Status geändert",
  INSTRUCTOR_CHANGED: "Lehrer geändert",
  BOOKING_CANCELLED: "Stornierung",
  PAYMENT_RECORDED: "Zahlung erfasst",
  ITEM_ADDED: "Position hinzugefügt",
  ITEM_REMOVED: "Position entfernt",
  PAYMENT_METHOD_CHANGED: "Zahlungsart festgelegt",
  BILLING_PARTNER_CHANGED: "Hotelabrechnung geändert",
};

const PA_LABELS: Record<string, string> = {
  created: "Privatlektionen angelegt",
  moved: "Privatlektion verschoben",
  period_updated: "Privatlektionen angepasst",
  edited: "Privatlektionen bearbeitet",
  confirmed: "Lektion bestätigt",
  declined: "Lektion abgelehnt",
};

/** Number from a persisted value; null/undefined/non-numeric => null (never coerced to 0). */
export function storedAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
const chf = (n: number) => `CHF ${n.toFixed(2)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "–");
const fmtTime = (t: unknown) => (typeof t === "string" ? t.slice(0, 5) : "–");
const slot = (s: Record<string, unknown> | undefined) => (s ? `${fmtDate(s.date)} ${fmtTime(s.time_start)}–${fmtTime(s.time_end)}` : "–");

type TeacherChange = "assigned" | "removed" | "changed";
const TEACHER_LABEL: Record<TeacherChange, string> = {
  assigned: "Lehrperson zugewiesen", removed: "Lehrperson entfernt (später zuweisen)", changed: "Lehrperson gewechselt",
};
/** Differences in a "moved" payload; null when from/to are not both objects (legacy/unknown shape). */
export function movedDiff(d: Record<string, unknown>): { slot: boolean; teacher: TeacherChange | null } | null {
  const from = d.from, to = d.to;
  if (!from || !to || typeof from !== "object" || typeof to !== "object") return null;
  const f = from as Record<string, unknown>, t = to as Record<string, unknown>;
  const slotChanged = String(f.date ?? "") !== String(t.date ?? "") || fmtTime(f.time_start) !== fmtTime(t.time_start) || fmtTime(f.time_end) !== fmtTime(t.time_end);
  const a = (f.instructor_id as string | null | undefined) ?? null, b = (t.instructor_id as string | null | undefined) ?? null;
  const teacher: TeacherChange | null = a === b ? null : !a ? "assigned" : !b ? "removed" : "changed";
  return { slot: slotChanged, teacher };
}

export function historyEventLabel(e: HistoryEventLike): string {
  if (e.event_type === "PRIVATE_APPOINTMENT_CHANGED") {
    const c = String(e.details?.change ?? "");
    if (c === "moved" && e.details) {
      // R1: label by what actually differs in the event's own payload (raw history unchanged).
      const m = movedDiff(e.details);
      if (m && !m.slot) return m.teacher ? TEACHER_LABEL[m.teacher] : "Privatlektion gespeichert (ohne Termin- oder Lehrpersonänderung)";
    }
    return PA_LABELS[c] ?? "Privatlektion geändert";
  }
  return EVENT_LABELS[e.event_type] ?? `Ereignis (${e.event_type})`;
}

function privateChange(d: Record<string, unknown>): string {
  const change = String(d.change ?? "");
  const ids = Array.isArray(d.appointment_ids) ? d.appointment_ids.length : null;
  const lessons = ids !== null ? plural(ids, "Lektion", "Lektionen") : "Lektionen";
  switch (change) {
    case "created": {
      const parts = [lessons];
      if (typeof d.persons === "number") parts.push(plural(d.persons, "Person", "Personen"));
      const disc = storedAmount(d.discount_percent);
      if (disc) parts.push(`Rabatt ${disc}%`);
      if (typeof d.unassigned === "number" && d.unassigned > 0) parts.push(`${d.unassigned} ohne Lehrperson (später zuweisen)`);
      const total = storedAmount(d.ticket_total_after_create);
      parts.push(total !== null ? `Buchungsbetrag nach Anlage der Lektionen: ${chf(total)}` : "Buchungsbetrag zu diesem Zeitpunkt nicht protokolliert");
      return parts.join(" · ");
    }
    case "moved": {
      const asObj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : undefined);
      const from = asObj(d.from), to = asObj(d.to);
      const m = movedDiff(d);
      // Unknown/legacy payload shape: show what is stored, never guess a difference.
      if (!m) return `${slot(from)} → ${slot(to)}`;
      const parts: string[] = [];
      if (m.slot) parts.push(`${slot(from)} → ${slot(to)}`);
      else parts.push(`Termin unverändert: ${slot(to)}`);
      if (m.teacher) parts.push(TEACHER_LABEL[m.teacher]);
      const o = storedAmount(d.old_total), n = storedAmount(d.new_total);
      if (d.pricing && (o !== null || n !== null)) parts.push(`Betrag ${o !== null ? chf(o) : "nicht protokolliert"} → ${n !== null ? chf(n) : "nicht protokolliert"}`);
      return parts.join(" · ");
    }
    case "period_updated": {
      const n = Array.isArray(d.changes) ? d.changes.length : null;
      const ex = Array.isArray(d.excluded) ? d.excluded.length : 0;
      return [n !== null ? `${plural(n, "Änderung", "Änderungen")} über den Zeitraum` : lessons, ex > 0 ? `${ex} ausgenommen` : null].filter(Boolean).join(" · ");
    }
    case "edited": {
      const parts = [Array.isArray(d.appointments) ? plural(d.appointments.length, "Lektion", "Lektionen") : lessons];
      const o = storedAmount(d.old_total), n = storedAmount(d.new_total);
      if (o !== null || n !== null) parts.push(`Betrag ${o !== null ? chf(o) : "nicht protokolliert"} → ${n !== null ? chf(n) : "nicht protokolliert"}`);
      if (d.notes_changed === true) parts.push("Notizen geändert");
      return parts.join(" · ");
    }
    case "confirmed": return `${lessons} von der Lehrperson bestätigt`;
    case "declined": return `${lessons} von der Lehrperson abgelehnt`;
    default: return `Änderung an ${lessons} (Typ: ${change || "unbekannt"})`;
  }
}

export function historyEventText(e: HistoryEventLike): string {
  const d = e.details || {};
  switch (e.event_type) {
    case "BOOKING_CREATED": {
      const total = storedAmount(d.total_amount);
      return `Ticket ${d.ticket_number || ""} erstellt · Betrag bei Anlage des Tickets: ${total !== null ? chf(total) : "nicht protokolliert"}`;
    }
    case "GROUP_BOOKING_CREATED": {
      // R1: final value of the group booking from this event's own payload.
      const total = storedAmount(d.ticket_total_after_create);
      const parts: string[] = [];
      if (typeof d.persons === "number") parts.push(plural(d.persons, "Person", "Personen"));
      if (typeof d.lines === "number") parts.push(plural(d.lines, "Position", "Positionen"));
      parts.push(total !== null ? `Buchungsbetrag nach Anlage: ${chf(total)}` : "Buchungsbetrag nicht protokolliert");
      return parts.join(" · ");
    }
    case "STATUS_CHANGED":
      return `${d.old_status || "–"} → ${d.new_status || "–"}`;
    case "INSTRUCTOR_CHANGED":
      return "Lehrer gewechselt";
    case "BOOKING_CANCELLED":
      return `${d.cancellation_type || "Stornierung"}: ${d.reason || "–"} (Gebühr: CHF ${d.cancellation_fee ?? 0})`;
    case "PRIVATE_APPOINTMENT_CHANGED":
      return privateChange(d);
    default:
      return EVENT_LABELS[e.event_type] ?? "Systemereignis";
  }
}

/** Chronological; same-transaction ties keep ticket creation first, then stable id order. */
export function compareHistory(a: { timestamp: string; type?: string; id: string; rank?: number }, b: { timestamp: string; id: string; rank?: number }): number {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() || (a.rank ?? 1) - (b.rank ?? 1) || a.id.localeCompare(b.id);
}
