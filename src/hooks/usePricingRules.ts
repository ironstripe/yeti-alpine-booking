import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PricingRule {
  id: string;
  name: string;
  description: string | null;
  type: "volume" | "duration" | "promo" | "partner";
  min_quantity: number | null;
  min_days: number | null;
  promo_code: string | null;
  partner_name: string | null;
  applies_to_products: string[] | null;
  discount_type: "percent" | "fixed" | "override";
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CancellationPolicy {
  id: string;
  free_cancellation_hours: number;
  late_cancellation_percent: number;
  no_show_percent: number;
  updated_at: string;
}

export function usePricingRules() {
  return useQuery({
    queryKey: ["pricing-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .select("*")
        .order("sort_order");

      if (error) throw error;
      return data as PricingRule[];
    },
  });
}

export function useCancellationPolicy() {
  return useQuery({
    queryKey: ["cancellation-policy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cancellation_policy")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CancellationPolicy | null;
    },
  });
}

export function useCreatePricingRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<PricingRule, "id" | "created_at" | "updated_at">) => {
      const { data: rule, error } = await supabase
        .from("pricing_rules")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return rule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing-rules"] });
      toast.success("Preisregel erstellt");
    },
    onError: (error) => {
      console.error("Error creating pricing rule:", error);
      toast.error("Fehler beim Erstellen");
    },
  });
}

export function useUpdatePricingRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<PricingRule> & { id: string }) => {
      const { error } = await supabase
        .from("pricing_rules")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing-rules"] });
      toast.success("Preisregel aktualisiert");
    },
    onError: (error) => {
      console.error("Error updating pricing rule:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}

export function useDeletePricingRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pricing_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing-rules"] });
      toast.success("Preisregel gelöscht");
    },
    onError: (error) => {
      console.error("Error deleting pricing rule:", error);
      toast.error("Fehler beim Löschen");
    },
  });
}

export function useUpdateCancellationPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<CancellationPolicy>) => {
      const { data: existing } = await supabase
        .from("cancellation_policy")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("cancellation_policy")
          .update(data)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cancellation_policy")
          .insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cancellation-policy"] });
      toast.success("Stornierungsbedingungen gespeichert");
    },
    onError: (error) => {
      console.error("Error saving cancellation policy:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}
