import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateIBAN, validatePaymentProfile, type PaymentProfile } from "@/lib/payments";

export type { PaymentProfile };

export function usePaymentProfiles(includeArchived = false) {
  return useQuery({
    queryKey: ["payment-profiles", includeArchived],
    queryFn: async () => {
      let query = supabase.from("payment_profiles").select("*").order("created_at", { ascending: false });
      if (!includeArchived) query = query.eq("is_archived", false);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PaymentProfile[];
    },
  });
}

export type PaymentProfileInput = Omit<PaymentProfile, "id" | "account_type"> & { id?: string };

function withDetectedAccountType(input: PaymentProfileInput) {
  const iban = validateIBAN(input.iban);
  return {
    ...input,
    iban: iban.normalized,
    account_type: iban.accountType ?? "iban",
  };
}

export function useSavePaymentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentProfileInput) => {
      const payload = withDetectedAccountType(input);
      const { id, ...fields } = payload as Record<string, unknown> & { id?: string };
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      if (id) {
        const { data, error } = await supabase
          .from("payment_profiles")
          .update({ ...fields, updated_by: userId, validation_status: "draft", is_active: false, is_default: false } as never)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("payment_profiles")
        .insert({ ...fields, created_by: userId, updated_by: userId } as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-profiles"] });
      toast.success("Zahlungsprofil gespeichert (Entwurf)");
    },
    onError: (error: Error) => toast.error(`Speichern fehlgeschlagen: ${error.message}`),
  });
}

export function useValidatePaymentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: PaymentProfile) => {
      const result = validatePaymentProfile(profile);
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("payment_profiles")
        .update({
          validation_status: result.valid ? "valid" : "invalid",
          validation_notes: result.valid ? null : result.errors.join("; "),
          account_type: result.accountType ?? "iban",
          validated_at: new Date().toISOString(),
          validated_by: userData?.user?.id ?? null,
        } as never)
        .eq("id", profile.id);
      if (error) throw error;
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["payment-profiles"] });
      if (result.valid) toast.success("Profil geprüft und gültig");
      else toast.error(`Profil ungültig: ${result.errors.join("; ")}`);
    },
    onError: (error: Error) => toast.error(`Prüfung fehlgeschlagen: ${error.message}`),
  });
}

export function useUpdatePaymentProfileState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profile,
      changes,
    }: {
      profile: PaymentProfile;
      changes: { is_active?: boolean; is_default?: boolean; is_archived?: boolean };
    }) => {
      // Only one active default per scope + currency.
      if (changes.is_default) {
        await supabase
          .from("payment_profiles")
          .update({ is_default: false } as never)
          .eq("country_scope", profile.country_scope)
          .eq("currency", profile.currency)
          .neq("id", profile.id);
      }
      const patch: Record<string, unknown> = { ...changes };
      if (changes.is_archived) {
        patch.is_active = false;
        patch.is_default = false;
      }
      const { error } = await supabase
        .from("payment_profiles")
        .update(patch as never)
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-profiles"] });
      toast.success("Zahlungsprofil aktualisiert");
    },
    onError: (error: Error) => toast.error(`Aktualisierung fehlgeschlagen: ${error.message}`),
  });
}
