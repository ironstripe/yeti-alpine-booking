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
}

export interface CanonicalEditSnapshot {
  ticketId: string;
  ticketNumber: string | null;
  customerId: string | null;
  totalAmount: number;
  paidAmount: number;
  customerNotes: string;
  internalNotes: string;
  instructorNotes: string;
  appointments: CanonicalAppointment[];
  /** Persons known from canonical links or the payer's participant list (selection options). */
  participants: CanonicalParticipant[];
}

export interface CanonicalEditDraft {
  participantIds: Record<string, string[]>; // appointment id -> selected ids
  meetingPoints: Record<string, string | null>;
  customerNotes: string;
  internalNotes: string;
  instructorNotes: string;
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
  const linkedItem = input.items.find((i) => i.appointment_id);
  const appointments = input.appointments
    .filter((a) => a.status !== "cancelled")
    .map((a): CanonicalAppointment => {
      const id = String(a.id);
      return {
        id,
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
    internalNotes: String(linkedItem?.internal_notes ?? ""),
    instructorNotes: String(linkedItem?.instructor_notes ?? ""),
    appointments,
    participants: input.participants.map((p) => ({ id: String(p.id), first_name: String(p.first_name ?? ""), last_name: (p.last_name as string) ?? null })),
  };
}

export function draftFromSnapshot(s: CanonicalEditSnapshot): CanonicalEditDraft {
  return {
    participantIds: Object.fromEntries(s.appointments.map((a) => [a.id, a.participantIds])),
    meetingPoints: Object.fromEntries(s.appointments.map((a) => [a.id, a.meetingPoint])),
    customerNotes: s.customerNotes,
    internalNotes: s.internalNotes,
    instructorNotes: s.instructorNotes,
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
    participant_ids?: string[];
    meeting_point?: string;
    acknowledged_price?: number;
  }[];
  internal_notes?: string;
  instructor_notes?: string;
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
    if (!partChanged && !mpChanged) continue;
    const q = quote?.appointments.find((x) => x.appointment_id === a.id);
    appointments.push({
      appointment_id: a.id,
      expected_participant_ids: a.participantIds,
      expected_price: a.price,
      ...(partChanged ? { participant_ids: next } : {}),
      ...(mpChanged ? { meeting_point: mp as string } : {}),
      ...(partChanged && q ? { acknowledged_price: q.new_price } : {}),
    });
  }
  const notes: Partial<EditRequest> = {};
  if (d.internalNotes !== s.internalNotes) notes.internal_notes = d.internalNotes;
  if (d.instructorNotes !== s.instructorNotes) notes.instructor_notes = d.instructorNotes;
  if (d.customerNotes !== s.customerNotes) notes.customer_notes = d.customerNotes;
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
