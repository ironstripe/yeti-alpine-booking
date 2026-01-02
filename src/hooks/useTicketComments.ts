import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TicketComment {
  id: string;
  ticket_id: string;
  ticket_item_id: string | null;
  comment_type: "internal" | "instructor";
  content: string;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
}

interface CreateCommentInput {
  ticket_id: string;
  ticket_item_id?: string | null;
  comment_type: "internal" | "instructor";
  content: string;
  created_by_user_id: string;
  created_by_name: string;
}

export function useTicketComments(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-comments", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];
      
      const { data, error } = await supabase
        .from("ticket_comments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as TicketComment[];
    },
    enabled: !!ticketId,
  });
}

export function useCreateTicketComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const { data, error } = await supabase
        .from("ticket_comments")
        .insert({
          ticket_id: input.ticket_id,
          ticket_item_id: input.ticket_item_id || null,
          comment_type: input.comment_type,
          content: input.content,
          created_by_user_id: input.created_by_user_id,
          created_by_name: input.created_by_name,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", variables.ticket_id] });
    },
  });
}

export function useUpdateTicketComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content, ticketId }: { id: string; content: string; ticketId: string }) => {
      const { data, error } = await supabase
        .from("ticket_comments")
        .update({ content })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", variables.ticketId] });
    },
  });
}

export function useDeleteTicketComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ticketId }: { id: string; ticketId: string }) => {
      const { error } = await supabase
        .from("ticket_comments")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ticket-comments", variables.ticketId] });
    },
  });
}

// Helper to create initial comments from booking wizard
export async function createInitialComments(
  ticketId: string,
  internalNotes: string | undefined,
  instructorNotes: string | undefined,
  userId: string,
  userName: string
) {
  const comments: CreateCommentInput[] = [];

  if (internalNotes?.trim()) {
    comments.push({
      ticket_id: ticketId,
      comment_type: "internal",
      content: internalNotes.trim(),
      created_by_user_id: userId,
      created_by_name: userName,
    });
  }

  if (instructorNotes?.trim()) {
    comments.push({
      ticket_id: ticketId,
      comment_type: "instructor",
      content: instructorNotes.trim(),
      created_by_user_id: userId,
      created_by_name: userName,
    });
  }

  if (comments.length === 0) return;

  const { error } = await supabase
    .from("ticket_comments")
    .insert(comments);

  if (error) throw error;
}
