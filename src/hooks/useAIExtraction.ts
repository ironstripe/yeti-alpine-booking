import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ParticipantBooking {
  product_type?: "private" | "group" | "unknown";
  product_suggestion?: string;
  dates?: Array<{
    date: string;
    start_time?: string;
    end_time?: string;
    time_preference?: string;
  }>;
  lunch_supervision?: boolean;
  is_vegetarian?: boolean;
}

export interface ExtractedParticipant {
  name: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  birth_date?: string;
  skill_level?: string;
  discipline?: string;
  notes?: string;
  booking?: ParticipantBooking;
}

export interface DateConflict {
  date: string;
  mentioned_weekday: string | null;
  actual_weekday: string;
  is_valid: boolean;
  conflict_type: "none" | "weekday_mismatch";
  suggestion: string | null;
  participant_name?: string;
}

export interface BookingSummary {
  total_participants?: number;
  has_different_levels?: boolean;
  has_different_dates?: boolean;
  has_different_products?: boolean;
  date_range?: {
    start?: string;
    end?: string;
  };
  warnings?: string[];
  date_conflicts?: DateConflict[];
  has_date_conflicts?: boolean;
}

export interface ExtractedData {
  customer?: {
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string | {
      street?: string;
      zip?: string;
      city?: string;
      country?: string;
    };
    hotel?: string;
  };
  participants?: ExtractedParticipant[];
  booking?: {
    product_type?: string;
    dates?: Array<{ date: string; start_time?: string; end_time?: string; time_preference?: string }>;
    date_range?: { start?: string; end?: string };
    start_date?: string;
    end_date?: string;
    flexibility?: string;
    instructor_preference?: string;
    lunch_supervision?: boolean;
    vegetarian?: boolean;
    special_requests?: string;
  };
  booking_summary?: BookingSummary;
  confidence: number;
  notes?: string;
  is_booking_request?: boolean;
  classification?: "new_booking" | "cancellation" | "modification" | "general_inquiry" | "complaint" | "other";
  detected_language?: "de" | "en";
  missing_information?: string[];
  matched_customer_id?: string | null;
  is_existing_customer?: boolean;
  data_completeness?: number;
  booking_ready?: boolean;
  ai_original_confidence?: number;
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
