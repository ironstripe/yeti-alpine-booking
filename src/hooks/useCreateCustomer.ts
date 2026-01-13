import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

type CustomerInsert = TablesInsert<"customers">;
type ContactInsert = TablesInsert<"customer_contacts">;

export interface ContactData {
  name: string;
  role?: string;
  phone: string;
  email?: string;
  is_primary?: boolean;
}

export interface CreateCustomerData extends CustomerInsert {
  contacts?: ContactData[];
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contacts, ...customer }: CreateCustomerData) => {
      // Create the customer first
      const { data, error } = await supabase
        .from("customers")
        .insert(customer)
        .select()
        .single();

      if (error) throw error;

      // If there are contacts, create them
      if (contacts && contacts.length > 0) {
        const contactsToInsert: ContactInsert[] = contacts.map((contact, index) => ({
          customer_id: data.id,
          name: contact.name,
          role: contact.role || null,
          phone: contact.phone,
          email: contact.email || null,
          is_primary: contact.is_primary ?? index === 0,
          sort_order: index,
        }));

        const { error: contactError } = await supabase
          .from("customer_contacts")
          .insert(contactsToInsert);

        if (contactError) {
          console.error("Error creating contacts:", contactError);
          // Don't fail the whole operation, just log the error
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
