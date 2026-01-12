import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type CustomerContact = Tables<"customer_contacts">;
export type CustomerContactInsert = TablesInsert<"customer_contacts">;
export type CustomerContactUpdate = TablesUpdate<"customer_contacts">;

export function useCustomerContacts(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-contacts", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      
      const { data, error } = await supabase
        .from("customer_contacts")
        .select("*")
        .eq("customer_id", customerId)
        .order("is_primary", { ascending: false })
        .order("sort_order");

      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });
}

export function useCreateCustomerContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contact: CustomerContactInsert) => {
      const { data, error } = await supabase
        .from("customer_contacts")
        .insert(contact)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", variables.customer_id] });
      toast.success("Kontakt hinzugefügt");
    },
    onError: (error) => {
      console.error("Error creating contact:", error);
      toast.error("Fehler beim Hinzufügen");
    },
  });
}

export function useUpdateCustomerContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, customerId, ...data }: CustomerContactUpdate & { id: string; customerId: string }) => {
      const { error } = await supabase
        .from("customer_contacts")
        .update(data)
        .eq("id", id);

      if (error) throw error;
      return { customerId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", result.customerId] });
      toast.success("Kontakt aktualisiert");
    },
    onError: (error) => {
      console.error("Error updating contact:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}

export function useDeleteCustomerContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, customerId }: { id: string; customerId: string }) => {
      const { error } = await supabase
        .from("customer_contacts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { customerId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", result.customerId] });
      toast.success("Kontakt gelöscht");
    },
    onError: (error) => {
      console.error("Error deleting contact:", error);
      toast.error("Fehler beim Löschen");
    },
  });
}
