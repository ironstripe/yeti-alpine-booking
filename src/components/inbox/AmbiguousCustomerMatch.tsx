import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface MatchCandidate {
  id: string;
  name: string;
  email: string;
}

interface AmbiguousCustomerMatchProps {
  conversationId: string;
  candidates: MatchCandidate[];
  onResolved: () => void;
}

export function AmbiguousCustomerMatch({ conversationId, candidates, onResolved }: AmbiguousCustomerMatchProps) {
  const queryClient = useQueryClient();

  const handleSelectCustomer = async (customerId: string | null) => {
    try {
      const updateData: Record<string, unknown> = {};
      
      if (customerId) {
        updateData.matched_customer_id = customerId;
      }
      
      // Also clear the ambiguous flag from extracted data
      const { data: conv } = await supabase
        .from("conversations")
        .select("ai_extracted_data")
        .eq("id", conversationId)
        .single();

      if (conv?.ai_extracted_data) {
        const extracted = conv.ai_extracted_data as Record<string, unknown>;
        delete extracted.customer_match_candidates;
        extracted.customer_match_method = customerId ? "manual_selection" : "confirmed_new";
        if (customerId) {
          extracted.matched_customer_id = customerId;
          extracted.is_existing_customer = true;
        }
        updateData.ai_extracted_data = extracted;
      }

      if (customerId) {
        updateData.matched_customer_id = customerId;
      }

      await supabase
        .from("conversations")
        .update(updateData)
        .eq("id", conversationId);

      queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      toast.success(customerId ? "Kunde zugeordnet" : "Als Neukunde markiert");
      onResolved();
    } catch (error) {
      toast.error("Fehler beim Zuordnen");
    }
  };

  return (
    <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
      <CardContent className="py-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Mehrere mögliche Kunden gefunden:
          </p>
        </div>
        <div className="space-y-2">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => handleSelectCustomer(candidate.id)}
              className="w-full text-left p-2 rounded border border-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-sm transition-colors"
            >
              <span className="font-medium">{candidate.name}</span>
              <span className="text-muted-foreground ml-2">{candidate.email}</span>
            </button>
          ))}
          <button
            onClick={() => handleSelectCustomer(null)}
            className="w-full text-left p-2 rounded border border-border hover:bg-muted text-sm text-muted-foreground transition-colors"
          >
            Keiner davon – Neukunde anlegen
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
