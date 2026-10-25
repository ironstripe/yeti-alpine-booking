import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TariffRule } from "@/lib/privateTariffRules";

export interface TariffRuleSet { revision: number; rules: TariffRule[] }

const normalize = (r: any): TariffRule => ({
  rule_kind: r.rule_kind,
  window_start: String(r.window_start).slice(0, 5),
  window_end: String(r.window_end).slice(0, 5),
  price_chf: Number(r.price_chf),
  extra_person_chf: Number(r.extra_person_chf),
  max_persons: Number(r.max_persons),
  max_block_minutes: r.max_block_minutes == null ? null : Number(r.max_block_minutes),
  office_only: !!r.office_only,
  provenance: r.provenance ?? "",
});

/** Configured rules + revision of one private product (staff RLS read). */
export function usePrivateTariffRules(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-private-tariff-rules", productId],
    enabled: !!productId,
    queryFn: async (): Promise<TariffRuleSet> => {
      // Tables come from supabase/pending/product_private_tariff_rules.sql (not installed yet).
      const db = supabase as any;
      const [rules, rev] = await Promise.all([
        db.from("product_private_tariff_rules").select("*").eq("product_id", productId!).order("window_start"),
        db.from("product_private_tariff_revisions").select("revision").eq("product_id", productId!).maybeSingle(),
      ]);
      if (rules.error) throw rules.error;
      if (rev.error) throw rev.error;
      return { revision: rev.data?.revision ?? 0, rules: (rules.data ?? []).map(normalize) };
    },
  });
}

/** Atomic, revision-checked save through the staff-only Edge Function. */
export function useSavePrivateTariffRules(productId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { expectedRevision: number; rules: TariffRule[] }): Promise<TariffRuleSet> => {
      const { data, error } = await supabase.functions.invoke("product-private-tariff-rules", {
        body: { product_id: productId, expected_revision: p.expectedRevision, rules: p.rules },
      });
      if (error) {
        const res = (error as { context?: Response }).context;
        let body: any = {};
        try { body = res ? await res.json() : {}; } catch { /* keep empty */ }
        if (body.error === "stale") throw new Error("Tarife wurden inzwischen geändert. Bitte neu laden. Es wurde nichts gespeichert.");
        throw new Error(body.message || "Tarife konnten nicht gespeichert werden. Es wurde nichts gespeichert.");
      }
      return { revision: data.revision, rules: (data.rules ?? []).map(normalize) };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["product-private-tariff-rules", productId] }),
  });
}
