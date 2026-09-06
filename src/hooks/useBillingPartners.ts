import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BillingPartner {
  id: string;
  name: string;
  partner_type: string;
  billing_email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingPartnerInput {
  name: string;
  billing_email?: string | null;
  address?: string | null;
  is_active?: boolean;
}

export function useBillingPartners(options?: { activeOnly?: boolean }) {
  const activeOnly = options?.activeOnly ?? false;

  return useQuery({
    queryKey: ["billing-partners", activeOnly],
    queryFn: async (): Promise<BillingPartner[]> => {
      let query = supabase
        .from("billing_partners")
        .select("*")
        .eq("partner_type", "hotel")
        .order("name");

      if (activeOnly) query = query.eq("is_active", true);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as BillingPartner[];
    },
  });
}

export function useCreateBillingPartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: BillingPartnerInput) => {
      const { data, error } = await supabase
        .from("billing_partners")
        .insert({
          name: input.name.trim(),
          partner_type: "hotel",
          billing_email: input.billing_email?.trim() || null,
          address: input.address?.trim() || null,
          is_active: input.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as BillingPartner;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-partners"] });
      toast.success("Hotel gespeichert");
    },
    onError: (error: Error) => {
      console.error("Create billing partner error:", error);
      toast.error("Hotel konnte nicht gespeichert werden");
    },
  });
}

export function useUpdateBillingPartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: BillingPartnerInput & { id: string }) => {
      const { error } = await supabase
        .from("billing_partners")
        .update({
          name: input.name.trim(),
          billing_email: input.billing_email?.trim() || null,
          address: input.address?.trim() || null,
          ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-partners"] });
      toast.success("Hotel aktualisiert");
    },
    onError: (error: Error) => {
      console.error("Update billing partner error:", error);
      toast.error("Hotel konnte nicht aktualisiert werden");
    },
  });
}

export function useToggleBillingPartnerActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("billing_partners")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
      return is_active;
    },
    onSuccess: (isActive) => {
      queryClient.invalidateQueries({ queryKey: ["billing-partners"] });
      toast.success(isActive ? "Hotel aktiviert" : "Hotel deaktiviert");
    },
    onError: () => toast.error("Status konnte nicht geändert werden"),
  });
}

/** Deletion is only allowed when no ticket references the hotel. */
export function useDeleteBillingPartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countError } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("billing_partner_id", id);

      if (countError) throw countError;
      if ((count || 0) > 0) {
        throw new Error("IN_USE");
      }

      const { error } = await supabase.from("billing_partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-partners"] });
      toast.success("Hotel gelöscht");
    },
    onError: (error: Error) => {
      if (error.message === "IN_USE") {
        toast.error("Hotel wird in Buchungen verwendet – bitte stattdessen deaktivieren");
      } else {
        toast.error("Hotel konnte nicht gelöscht werden");
      }
    },
  });
}
