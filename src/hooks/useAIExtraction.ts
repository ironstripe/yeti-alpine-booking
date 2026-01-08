import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExtractedData {
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    hotel?: string;
  };
  participants?: Array<{
    name: string;
    age?: number;
    birth_date?: string;
    skill_level?: string;
    discipline?: string;
    notes?: string;
  }>;
  booking?: {
    product_type?: string;
    dates?: Array<{ date: string; time_preference?: string }>;
    date_range?: { start?: string; end?: string };
    flexibility?: string;
    instructor_preference?: string;
    lunch_supervision?: boolean;
    special_requests?: string;
  };
  confidence: number;
  notes?: string;
  is_booking_request?: boolean;
}

export function useTriggerAIExtraction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke("process-ai-message", {
        body: { conversationId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, conversationId) => {
      if (data.isBookingRequest) {
        toast.success("KI-Extraktion abgeschlossen", {
          description: `Konfidenz: ${Math.round(data.confidence * 100)}%`,
        });
      } else {
        toast.info("Keine Buchungsanfrage erkannt");
      }
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      console.error("AI extraction error:", error);
      toast.error("KI-Extraktion fehlgeschlagen", {
        description: "Bitte versuchen Sie es erneut",
      });
    },
  });
}

export function useUpdateExtractedData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      extractedData,
    }: {
      conversationId: string;
      extractedData: ExtractedData;
    }) => {
      const { error } = await supabase
        .from("conversations")
        .update({
          ai_extracted_data: JSON.parse(JSON.stringify(extractedData)),
          ai_confidence_score: extractedData.confidence,
          extraction_notes: extractedData.notes || null,
        })
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: (_, { conversationId }) => {
      toast.success("Änderungen gespeichert");
      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    },
    onError: (error) => {
      console.error("Update error:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}

export function useMarkConversationProcessed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      ticketId,
    }: {
      conversationId: string;
      ticketId?: string;
    }) => {
      const { error } = await supabase
        .from("conversations")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          related_ticket_id: ticketId || null,
        })
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });
}
