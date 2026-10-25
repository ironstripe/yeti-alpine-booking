// R1 (S1): immutable, versioned invoice content snapshot (invoices.content_snapshot, version 1).
// Built ONCE when a NEW invoice is issued, from the canonical booking read projection: one financial line
// per billing line (private: one per appointment, every person listed, amount never multiplied).
// Office preview/print, server HTML/PDF and invoice delivery render a v1 snapshot as stored; invoices
// without a snapshot (legacy) keep their existing line rendering byte-for-byte. Dependency-free.
import { projectBookingLines, type ProjectionAppointment, type ProjectionLink, type ProjectionPerson } from "./bookingReadProjection.ts";

export const INVOICE_CONTENT_VERSION = 1;
export interface InvoiceContentLine { description: string; details?: string; amount: number; ticket_item_ids: string[] }
export interface InvoiceContentSnapshotV1 { version: 1; lines: InvoiceContentLine[] }

export interface ContentItem {
  id: string; appointment_id?: string | null; date: string | null; end_date?: string | null;
  time_start: string | null; time_end: string | null; line_total: number | null; unit_price?: number | null;
  group_name?: string | null; item_type?: string | null; is_vegetarian?: boolean | null;
  product?: { name?: string | null } | null; participant?: ProjectionPerson | null;
}
export interface ContentQuoteLine { ticket_item_ids?: string[]; dates?: string[]; blocks?: string[] }

const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "");
const hm = (t?: string | null) => String(t ?? "").slice(0, 5);
const WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const weekday = (d: string) => WEEKDAY[new Date(`${d.slice(0, 10)}T12:00:00Z`).getUTCDay()];

export function buildInvoiceContentV1(
  items: ContentItem[], appointments: ProjectionAppointment[], links: ProjectionLink[],
  people: ProjectionPerson[], instructors: ProjectionPerson[], quoteLines: ContentQuoteLine[] = [],
): InvoiceContentSnapshotV1 {
  const proj = projectBookingLines(items, appointments, links, people, instructors);
  const lines = items.map((it): InvoiceContentLine => {
    const amount = Number(it.line_total ?? it.unit_price ?? 0);
    const name = it.product?.name ?? it.group_name ?? "Leistung";
    const p = proj[it.id];
    if (it.appointment_id) {
      if (!p?.appointment) throw new Error("invoice_content_incomplete");
      const a = p.appointment;
      // Canonical private lessons always have >=1 participant link; every linked person and an assigned
      // teacher must resolve to a row. NULL instructor_id = genuinely unassigned ("Später zuweisen").
      const raw = appointments.find((x) => x.id === it.appointment_id);
      const linked = links.filter((l) => l.appointment_id === it.appointment_id);
      if (!raw || linked.length === 0) throw new Error("invoice_content_incomplete");
      if (linked.some((l) => !people.some((x) => x.id === l.participant_id))) throw new Error("invoice_content_incomplete");
      if (raw.instructor_id && !instructors.some((x) => x.id === raw.instructor_id)) throw new Error("invoice_content_incomplete");
      if (p.people.length !== new Set(linked.map((l) => l.participant_id)).size) throw new Error("invoice_content_incomplete");
      const who = p.people.map((x) => x.name).join(", ");
      const when = `${weekday(a.date)} ${fmtDate(a.date)} ${hm(a.time_start)}–${hm(a.time_end)}`;
      return { description: name, details: [who, when, p.instructorName ? `Lehrperson: ${p.instructorName}` : null].filter(Boolean).join(" · "), amount, ticket_item_ids: [it.id] };
    }
    const q = quoteLines.find((l) => (l.ticket_item_ids ?? []).includes(it.id));
    const when = q?.dates ? q.dates.map(fmtDate).join(", ")
      : it.end_date && it.end_date !== it.date ? `${fmtDate(it.date)}–${fmtDate(it.end_date)}` : fmtDate(it.date);
    const time = it.item_type === "lunch" ? `Mittagsbetreuung${it.is_vegetarian ? " · vegetarisch" : ""}`
      : q?.blocks ? q.blocks.join(" + ") : it.time_start ? `${hm(it.time_start)}–${hm(it.time_end)}` : null;
    const who = it.participant ? p?.people.map((x) => x.name).join(", ") : null;
    return { description: name, details: [who, when, time].filter(Boolean).join(" · "), amount, ticket_item_ids: [it.id] };
  });
  return { version: 1, lines };
}

/** Lines of a stored v1 snapshot, or null when the invoice has none (legacy) or an unknown version. */
export function snapshotLines(snapshot: unknown): Array<{ description: string; details?: string; amount: number }> | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as { version?: unknown; lines?: unknown };
  if (s.version !== 1 || !Array.isArray(s.lines)) return null;
  return s.lines.map((l: any) => ({ description: String(l.description ?? ""), ...(l.details ? { details: String(l.details) } : {}), amount: Number(l.amount) }));
}
