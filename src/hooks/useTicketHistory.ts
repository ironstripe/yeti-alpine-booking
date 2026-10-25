import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTicketComments, TicketComment } from "./useTicketComments";
import { compareHistory, historyEventLabel, historyEventText } from "@/lib/ticketHistoryFormat";

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
  /** Raw event type for traceability (events only). */
  eventType?: string;
  rank?: number;
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
      type: historyEventLabel(e),
      content: historyEventText(e),
      eventType: e.event_type,
      rank: e.event_type === "BOOKING_CREATED" ? 0 : 1,
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
  ].sort(compareHistory);

  return {
    data: timeline,
    isLoading: historyLoading || commentsLoading,
  };
}
