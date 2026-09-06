import { supabase } from "@/integrations/supabase/client";

/**
 * Append an entry to the booking audit trail (ticket_history), including the
 * acting YETI user and a timestamp (created_at defaults to now()).
 */
export async function logTicketEvent(
  ticketId: string,
  eventType: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("ticket_history").insert({
      ticket_id: ticketId,
      event_type: eventType,
      created_by_user_id: user?.id ?? null,
      details: {
        ...details,
        actor_email: user?.email ?? null,
      },
    });
  } catch (error) {
    // Audit logging must never break the user-facing operation
    console.error("Audit log failed:", eventType, error);
  }
}
