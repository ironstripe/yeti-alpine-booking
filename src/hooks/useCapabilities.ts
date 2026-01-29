import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Capability {
  id: string;
  name: string;
  category: string | null;
  created_at: string;
}

export function useCapabilities() {
  return useQuery({
    queryKey: ["capabilities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capabilities")
        .select("*")
        .order("category")
        .order("name");

      if (error) {
        console.error("Error fetching capabilities:", error);
        throw error;
      }

      return data as Capability[];
    },
  });
}

// Group capabilities by category for UI display
export function groupCapabilitiesByCategory(capabilities: Capability[]) {
  const grouped: Record<string, Capability[]> = {};
  
  for (const cap of capabilities) {
    const category = cap.category || "Andere";
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(cap);
  }
  
  return grouped;
}
