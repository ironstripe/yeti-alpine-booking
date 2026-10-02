/**
 * Shared scheduler selection rule: billing rows (ticket_items) that point at the same
 * private appointment render as ONE scheduler block. Used by useSchedulerData and by the
 * Booking-Corner migration acceptance tests so both exercise the same logic.
 */
export function collapseAppointmentRows<T extends { appointment_id?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const id = r.appointment_id;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
