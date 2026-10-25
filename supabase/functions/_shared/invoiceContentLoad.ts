// R1 (S1): server-side loader for the invoice content snapshot (service-role client). Reads the canonical
// relationships in one batch per table; any read failure or incomplete private relationship aborts issuance
// (fail closed) instead of freezing a wrong document.
import { buildInvoiceContentV1, type ContentItem, type InvoiceContentSnapshotV1 } from "./invoiceContent.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export async function loadInvoiceContent(sb: Client, ticketId: string): Promise<InvoiceContentSnapshotV1> {
  const { data: items, error: e1 } = await sb.from("ticket_items")
    .select("id, appointment_id, date, end_date, time_start, time_end, line_total, unit_price, group_name, item_type, is_vegetarian, product:products(name), participant:customer_participants(id, first_name, last_name)")
    .eq("ticket_id", ticketId).neq("status", "cancelled").order("date").order("time_start");
  if (e1) throw new Error("invoice_content_read_failed");
  const rows = (items ?? []) as ContentItem[];
  const apptIds = rows.map((r) => r.appointment_id).filter((x): x is string => !!x);
  let appointments: any[] = [], links: any[] = [], people: any[] = [], instructors: any[] = [];
  if (apptIds.length) {
    const a = await sb.from("private_appointments").select("id, date, time_start, time_end, instructor_id, meeting_point").in("id", apptIds);
    const l = await sb.from("private_appointment_participants").select("appointment_id, participant_id").in("appointment_id", apptIds);
    if (a.error || l.error) throw new Error("invoice_content_read_failed");
    appointments = a.data ?? []; links = l.data ?? [];
    const pids = [...new Set(links.map((x) => x.participant_id))];
    const tids = [...new Set(appointments.map((x) => x.instructor_id).filter(Boolean))];
    if (pids.length) {
      const p = await sb.from("customer_participants").select("id, first_name, last_name").in("id", pids);
      if (p.error) throw new Error("invoice_content_read_failed"); people = p.data ?? [];
    }
    if (tids.length) {
      const t = await sb.from("instructors").select("id, first_name, last_name").in("id", tids);
      if (t.error) throw new Error("invoice_content_read_failed"); instructors = t.data ?? [];
    }
  }
  const r = await sb.from("bc_2627_reservations").select("quote_snapshot").eq("ticket_id", ticketId).maybeSingle();
  // The reservations table exists only with the 26/27 course flow; a missing table means "no quote lines".
  if (r.error && r.error.code !== "42P01" && r.error.code !== "PGRST205") throw new Error("invoice_content_read_failed");
  for (const row of rows) if (row.participant) people.push(row.participant);
  return buildInvoiceContentV1(rows, appointments, links, people, instructors, r.data?.quote_snapshot?.lines ?? []);
}
