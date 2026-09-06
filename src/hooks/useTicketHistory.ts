import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTicketComments, TicketComment } from "./useTicketComments";

export interface TicketHistoryEvent {
  id: string;
  ticket_id: string;
  created_at: string;
  created_by_user_id: string | null;
  event_type: string;
  details: Record<string, unknown>;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  source: "comment" | "event";
  type: string;
  content: string | null;
  details: Record<string, unknown> | null;
  actorName: string | null;
  commentType?: "internal" | "instructor";
}

const EVENT_LABELS: Record<string, string> = {
  BOOKING_CREATED: "Buchung erstellt",
  STATUS_CHANGED: "Status geändert",
  INSTRUCTOR_CHANGED: "Lehrer geändert",
  BOOKING_CANCELLED: "Stornierung",
  PAYMENT_RECORDED: "Zahlung erfasst",
  ITEM_ADDED: "Position hinzugefügt",
  ITEM_REMOVED: "Position entfernt",
  PAYMENT_METHOD_CHANGED: "Zahlungsart festgelegt",
  BILLING_PARTNER_CHANGED: "Hotelabrechnung geändert",
};

function formatEventDetails(event: TicketHistoryEvent): string {
  const d = event.details || {};
  switch (event.event_type) {
    case "BOOKING_CREATED":
      return `Ticket ${d.ticket_number || ""} erstellt (CHF ${d.total_amount ?? "–"})`;
    case "STATUS_CHANGED":
      return `${d.old_status || "–"} → ${d.new_status || "–"}`;
    case "INSTRUCTOR_CHANGED":
      return `Lehrer gewechselt`;
    case "BOOKING_CANCELLED":
      return `${d.cancellation_type || "Stornierung"}: ${d.reason || "–"} (Gebühr: CHF ${d.cancellation_fee ?? 0})`;
    default:
      return EVENT_LABELS[event.event_type] || event.event_type;
  }
}

export function useTicketHistory(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-history", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];
      const { data, error } = await supabase
        .from("ticket_history")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as TicketHistoryEvent[];
    },
    enabled: !!ticketId,
  });
}

export function useUnifiedTimeline(ticketId: string | undefined) {
  const { data: history = [], isLoading: historyLoading } = useTicketHistory(ticketId);
  const { data: comments = [], isLoading: commentsLoading } = useTicketComments(ticketId);

  const timeline: TimelineEntry[] = [
    ...history.map((e): TimelineEntry => ({
      id: e.id,
      timestamp: e.created_at,
      source: "event",
      type: EVENT_LABELS[e.event_type] || e.event_type,
      content: formatEventDetails(e),
      details: e.details,
      actorName: (e.details?.actor_email as string) || null,
    })),
    ...comments.map((c: TicketComment): TimelineEntry => ({
      id: c.id,
      timestamp: c.created_at,
      source: "comment",
      type: c.comment_type === "instructor" ? "Lehrer-Notiz" : "Interner Kommentar",
      content: c.content,
      details: null,
      actorName: c.created_by_name,
      commentType: c.comment_type,
    })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    data: timeline,
    isLoading: historyLoading || commentsLoading,
  };
}
