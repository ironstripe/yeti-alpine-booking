import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface UpdateCustomerData {
  first_name?: string | null;
  last_name?: string;
  email?: string;
  phone?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  preferred_channel?: string | null;
  language?: string | null;
  marketing_consent?: boolean | null;
  notes?: string | null;
}

export function useUpdateCustomer(customerId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: UpdateCustomerData) => {
      const { error } = await supabase
        .from("customers")
        .update(data)
        .eq("id", customerId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({
        title: "Kunde aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Kunde konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
      console.error("Update customer error:", error);
    },
  });
}
