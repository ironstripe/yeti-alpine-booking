// B03a: hydration and diff for editing an existing canonical private booking.
// Pure helpers: the server (private-appointments `edit` → pa_edit_booking) stays authoritative for
// prices, protection and conflicts. Unchanged edits produce no request at all.

export interface CanonicalParticipant { id: string; first_name: string; last_name: string | null }

export interface CanonicalAppointment {
  id: string;
  date: string;
  timeStart: string; // HH:MM
  timeEnd: string;
  instructorId: string | null;
  instructorName: string | null;
  meetingPoint: string | null;
  status: string;
  price: number;
  discountPercent: number;
  participantIds: string[]; // sorted
  internalNotes: string;
  instructorNotes: string;
  original: { date: string; time_start: string; time_end: string; instructor_id: string | null; meeting_point: string | null; status: string; line: { id: string; quantity: number | null; unit_price: number; line_total: number | null; discount_percent: number | null; discount_reason: string | null; internal_notes: string | null; instructor_notes: string | null } };
}

export interface CanonicalEditSnapshot {
  ticketId: string;
  ticketNumber: string | null;
  customerId: string | null;
  totalAmount: number;
  paidAmount: number;
  customerNotes: string;
  originalCustomerNotes: string | null;
  appointments: CanonicalAppointment[];
  /** Persons known from canonical links or the payer's participant list (selection options). */
  participants: CanonicalParticipant[];
}

export interface CanonicalEditDraft {
  participantIds: Record<string, string[]>; // appointment id -> selected ids
  meetingPoints: Record<string, string | null>;
  customerNotes: string;
  internalNotes: Record<string, string>;
  instructorNotes: Record<string, string>;
}

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));
const hhmm = (v: unknown) => String(v ?? "").slice(0, 5);
const sorted = (a: string[]) => [...new Set(a)].sort();

/** Builds the snapshot from DB rows; never derives people from ticket_items.participant_id. */
export function hydrateCanonicalEdit(input: {
  ticket: Row;
  items: Row[];
  appointments: Row[];
  links: { appointment_id: string; participant_id: string }[];
  participants: Row[];
  instructors: Row[];
}): CanonicalEditSnapshot {
  const names = new Map(input.instructors.map((i) => [String(i.id), `${i.first_name ?? ""} ${i.last_name ?? ""}`.trim()]));
  const itemByAppt = new Map(input.items.filter((i) => i.appointment_id).map((i) => [String(i.appointment_id), i]));

  const appointments = input.appointments
    .filter((a) => a.status !== "cancelled")
    .map((a): CanonicalAppointment => {
      const id = String(a.id);
      const item = itemByAppt.get(id);
      return {
        id,
        internalNotes: String(item?.internal_notes ?? ""),
        instructorNotes: String(item?.instructor_notes ?? ""),
        original: { date: String(a.date), time_start: String(a.time_start), time_end: String(a.time_end),
          instructor_id: (a.instructor_id as string) ?? null, meeting_point: (a.meeting_point as string) ?? null, status: String(a.status),
          line: { id: String(item?.id), quantity: item?.quantity == null ? null : num(item.quantity), unit_price: num(item?.unit_price),
            line_total: item?.line_total == null ? null : num(item.line_total), discount_percent: item?.discount_percent == null ? null : num(item.discount_percent),
            discount_reason: (item?.discount_reason as string) ?? null, internal_notes: (item?.internal_notes as string) ?? null, instructor_notes: (item?.instructor_notes as string) ?? null } },
        date: String(a.date),
        timeStart: hhmm(a.time_start),
        timeEnd: hhmm(a.time_end),
        instructorId: (a.instructor_id as string) ?? null,
        instructorName: a.instructor_id ? names.get(String(a.instructor_id)) ?? null : null,
        meetingPoint: (a.meeting_point as string) ?? null,
        status: String(a.status ?? ""),
        price: num(a.price),
        discountPercent: num(itemByAppt.get(id)?.discount_percent),
        participantIds: sorted(input.links.filter((l) => l.appointment_id === id).map((l) => l.participant_id)),
      };
    })
    .sort((x, y) => (x.date + x.timeStart).localeCompare(y.date + y.timeStart));
  return {
    ticketId: String(input.ticket.id),
    ticketNumber: (input.ticket.ticket_number as string) ?? null,
    customerId: (input.ticket.customer_id as string) ?? null,
    totalAmount: num(input.ticket.total_amount),
    paidAmount: num(input.ticket.paid_amount),
    customerNotes: String(input.ticket.notes ?? ""),
    originalCustomerNotes: (input.ticket.notes as string) ?? null,
    appointments,
    participants: input.participants.map((p) => ({ id: String(p.id), first_name: String(p.first_name ?? ""), last_name: (p.last_name as string) ?? null })),
  };
}

export function draftFromSnapshot(s: CanonicalEditSnapshot): CanonicalEditDraft {
  return {
    participantIds: Object.fromEntries(s.appointments.map((a) => [a.id, a.participantIds])),
    meetingPoints: Object.fromEntries(s.appointments.map((a) => [a.id, a.meetingPoint])),
    customerNotes: s.customerNotes,
    internalNotes: Object.fromEntries(s.appointments.map((a) => [a.id, a.internalNotes])),
    instructorNotes: Object.fromEntries(s.appointments.map((a) => [a.id, a.instructorNotes])),
  };
}

export interface EditQuoteAppointment { appointment_id: string; old_price: number; new_price: number; participants_changed: boolean }
export interface EditQuote { appointments: EditQuoteAppointment[]; old_total: number; new_total: number; changed: boolean }

export interface EditRequest {
  ticket_id: string;
  expected_total: number;
  appointments: {
    appointment_id: string;
    expected_participant_ids: string[];
    expected_price: number;
    expected: CanonicalAppointment["original"];
    internal_notes?: string;
    instructor_notes?: string;
    participant_ids?: string[];
    meeting_point?: string;
    acknowledged_price?: number;
  }[];
  expected_customer_notes?: string | null;
  customer_notes?: string;
  acknowledged_total?: number;
}

/** Only explicitly changed fields are sent; returns null when nothing changed (no request, no writes). */
export function buildEditRequest(s: CanonicalEditSnapshot, d: CanonicalEditDraft, quote?: EditQuote | null): EditRequest | null {
  const appointments: EditRequest["appointments"] = [];
  for (const a of s.appointments) {
    const next = sorted(d.participantIds[a.id] ?? a.participantIds);
    const partChanged = next.join() !== a.participantIds.join();
    const mp = d.meetingPoints[a.id] ?? null;
    const mpChanged = mp !== a.meetingPoint && mp !== null;
    const intChanged = d.internalNotes[a.id] !== a.internalNotes;
    const insChanged = d.instructorNotes[a.id] !== a.instructorNotes;
    if (!partChanged && !mpChanged && !intChanged && !insChanged) continue;
    const q = quote?.appointments.find((x) => x.appointment_id === a.id);
    appointments.push({
      appointment_id: a.id,
      expected_participant_ids: a.participantIds,
      expected_price: a.price,
      expected: a.original,
      ...(intChanged ? { internal_notes: d.internalNotes[a.id] } : {}),
      ...(insChanged ? { instructor_notes: d.instructorNotes[a.id] } : {}),
      ...(partChanged ? { participant_ids: next } : {}),
      ...(mpChanged ? { meeting_point: mp as string } : {}),
      ...(partChanged && q ? { acknowledged_price: q.new_price } : {}),
    });
  }
  const notes: Partial<EditRequest> = {};
  if (d.customerNotes !== s.customerNotes) { notes.customer_notes = d.customerNotes; notes.expected_customer_notes = s.originalCustomerNotes; }
  if (appointments.length === 0 && Object.keys(notes).length === 0) return null;
  return {
    ticket_id: s.ticketId,
    expected_total: s.totalAmount,
    appointments,
    ...notes,
    ...(quote && appointments.some((a) => a.participant_ids) ? { acknowledged_total: quote.new_total } : {}),
  };
}

/** True when the edit changes people and therefore needs a confirmed server quote before saving. */
export const needsQuote = (r: EditRequest | null) => !!r?.appointments.some((a) => a.participant_ids);
