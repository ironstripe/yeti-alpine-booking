import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { toast } from "sonner";

export type ConversationFilter = "all" | "unread" | "whatsapp" | "email";

interface UseConversationsOptions {
  filter: ConversationFilter;
  search: string;
  limit?: number;
}

export interface ConversationWithCustomer {
  id: string;
  channel: string;
  contact_name: string | null;
  contact_identifier: string;
  subject: string | null;
  content: string;
  status: string | null;
  direction: string;
  created_at: string;
  customer_id: string | null;
  ai_extracted_data?: unknown;
  ai_confidence_score?: number | null;
  customer?: {
    first_name: string | null;
    last_name: string;
  } | null;
}

export function useConversations({ filter, search, limit = 50 }: UseConversationsOptions) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations", filter, search, limit],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select(`
          id,
          channel,
          contact_name,
          contact_identifier,
          subject,
          content,
          status,
          direction,
          created_at,
          customer_id,
          ai_extracted_data,
          ai_confidence_score,
          customers (
            first_name,
            last_name
          )
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      // Apply filter
      if (filter === "unread") {
        query = query.eq("status", "unread");
      } else if (filter === "whatsapp") {
        query = query.eq("channel", "whatsapp");
      } else if (filter === "email") {
        query = query.eq("channel", "email");
      }

      // Apply search
      if (search.trim()) {
        query = query.or(
          `contact_name.ilike.%${search}%,contact_identifier.ilike.%${search}%,content.ilike.%${search}%,subject.ilike.%${search}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((item) => ({
        ...item,
        customer: item.customers,
      })) as ConversationWithCustomer[];
    },
  });

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("conversations-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newConversation = payload.new as ConversationWithCustomer;
            toast.info(`Neue Nachricht von ${newConversation.contact_name || newConversation.contact_identifier}`);
          }
          // Invalidate and refetch
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["conversation-counts"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useConversationCounts() {
  return useQuery({
    queryKey: ["conversation-counts"],
    queryFn: async () => {
      const [allResult, unreadResult, whatsappResult, emailResult] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "unread"),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("channel", "whatsapp"),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("channel", "email"),
      ]);

      return {
        all: allResult.count || 0,
        unread: unreadResult.count || 0,
        whatsapp: whatsappResult.count || 0,
        email: emailResult.count || 0,
      };
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  const markAllAsRead = async () => {
    const { error } = await supabase
      .from("conversations")
      .update({ status: "read" })
      .eq("status", "unread");

    if (error) throw error;

    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["conversation-counts"] });
    toast.success("Alle Nachrichten als gelesen markiert");
  };

  return { markAllAsRead };
}
