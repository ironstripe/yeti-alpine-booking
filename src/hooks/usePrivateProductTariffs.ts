import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TariffCell, TariffCellInput } from "@/lib/privateTariffMatrix";

/** Effective editable prices (product_private_tariffs) for one product. */
export function usePrivateProductTariffs(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-private-tariffs", productId],
    enabled: !!productId,
    queryFn: async (): Promise<TariffCell[]> => {
      // Table is added by supabase/pending/product_private_tariffs.sql; the generated
      // types refresh only once that migration is installed, hence the cast.
      const { data, error } = await (supabase as any)
        .from("product_private_tariffs")
        .select("duration_minutes, persons_per_lesson, price_chf")
        .eq("product_id", productId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        duration_minutes: r.duration_minutes,
        persons_per_lesson: r.persons_per_lesson,
        price_chf: Number(r.price_chf),
      }));
    },
  });
}

/** Immutable Booking-Corner original private tariffs (display fallback/comparison). */
export function useBcOriginalPrivateTariffs(productId: string | undefined) {
  return useQuery({
    queryKey: ["bc-product-tariffs", productId],
    enabled: !!productId,
    queryFn: async (): Promise<TariffCell[]> => {
      const { data, error } = await supabase
        .from("bc_product_tariff_sources")
        .select("duration_minutes, persons_per_lesson, price_chf")
        .eq("product_id", productId!)
        .eq("import_status", "draft")
        .eq("day_count", 1);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        duration_minutes: r.duration_minutes,
        persons_per_lesson: r.persons_per_lesson,
        price_chf: Number(r.price_chf),
      }));
    },
  });
}

/** Atomic server-side save of changed matrix cells (staff-only edge function). */
export function useSavePrivateProductTariffs(productId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cells: TariffCellInput[]): Promise<TariffCell[]> => {
      const { data, error } = await supabase.functions.invoke("product-private-tariffs", {
        body: { product_id: productId, cells },
      });
      if (error) throw new Error(error.message || "Tarife konnten nicht gespeichert werden");
      if (data?.error) throw new Error(data.error);
      return (data?.tariffs ?? []).map((r: any) => ({
        duration_minutes: r.duration_minutes,
        persons_per_lesson: r.persons_per_lesson,
        price_chf: Number(r.price_chf),
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-private-tariffs", productId] });
    },
    onError: (error) => {
      console.error("Error saving private tariffs:", error);
      toast.error(`Tarife nicht gespeichert: ${error.message}`);
    },
  });
}
