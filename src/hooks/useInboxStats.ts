import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subHours } from "date-fns";

export interface InboxStats {
  newCount: number;
  inProgressCount: number;
  overdueCount: number;
  autoQuote: number;
}

export function useInboxStats() {
  return useQuery({
    queryKey: ["inbox-stats"],
    queryFn: async (): Promise<InboxStats> => {
      const overdueThreshold = subHours(new Date(), 24).toISOString();
      
      // Run queries in parallel
      const [
        newResult,
        inProgressResult,
        overdueResult,
        highConfidenceResult,
        totalWithExtractionResult,
      ] = await Promise.all([
        // New/unread conversations
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("status", "unread")
          .eq("direction", "inbound"),
        
        // In progress (read but not processed)
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("status", "read")
          .eq("direction", "inbound"),
        
        // Overdue (unread and older than 24h)
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("status", "unread")
          .eq("direction", "inbound")
          .lt("created_at", overdueThreshold),
        
        // High confidence extractions (>85%)
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("direction", "inbound")
          .gte("ai_confidence_score", 0.85)
          .not("ai_extracted_data", "is", null),
        
        // Total with extractions
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("direction", "inbound")
          .not("ai_extracted_data", "is", null),
      ]);
      
      const newCount = newResult.count || 0;
      const inProgressCount = inProgressResult.count || 0;
      const overdueCount = overdueResult.count || 0;
      const highConfidenceCount = highConfidenceResult.count || 0;
      const totalWithExtraction = totalWithExtractionResult.count || 0;
      
      // Calculate auto-quote percentage
      const autoQuote = totalWithExtraction > 0
        ? Math.round((highConfidenceCount / totalWithExtraction) * 100)
        : 0;
      
      return {
        newCount,
        inProgressCount,
        overdueCount,
        autoQuote,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
