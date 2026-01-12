import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SchoolTariff {
  hourly_rate: number;
  currency: string;
  min_hours_per_group: number;
  description: string;
}

const DEFAULT_TARIFF: SchoolTariff = {
  hourly_rate: 95.0,
  currency: "CHF",
  min_hours_per_group: 1.5,
  description: "Reduzierter Stundensatz für Schulen und Skilager",
};

export function useSchoolTariff() {
  return useQuery({
    queryKey: ["school-tariff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      // Cast to get the school_tariff field from the raw data
      const rawData = data as Record<string, unknown> | null;
      if (!rawData?.school_tariff) {
        return DEFAULT_TARIFF;
      }
      
      const tariff = rawData.school_tariff as Record<string, unknown>;
      return {
        hourly_rate: Number(tariff.hourly_rate) || DEFAULT_TARIFF.hourly_rate,
        currency: String(tariff.currency || DEFAULT_TARIFF.currency),
        min_hours_per_group: Number(tariff.min_hours_per_group) || DEFAULT_TARIFF.min_hours_per_group,
        description: String(tariff.description || DEFAULT_TARIFF.description),
      } as SchoolTariff;
    },
  });
}

export function useUpdateSchoolTariff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tariff: SchoolTariff) => {
      // Get existing settings
      const { data: existing } = await supabase
        .from("school_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      // Use raw SQL-like update with the JSONB column
      const tariffJson = {
        hourly_rate: tariff.hourly_rate,
        currency: tariff.currency,
        min_hours_per_group: tariff.min_hours_per_group,
        description: tariff.description,
      };

      if (existing) {
        const { error } = await supabase
          .from("school_settings")
          .update({ school_tariff: tariffJson } as never)
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("school_settings")
          .insert({ name: "Skischule", school_tariff: tariffJson } as never);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-tariff"] });
      toast.success("Schultarif gespeichert");
    },
    onError: (error) => {
      console.error("Error saving school tariff:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}

// Calculate price for school booking
export function calculateSchoolPrice(
  groups: Array<{ hours: number }>,
  hourlyRate: number
): number {
  return groups.reduce((total, group) => total + group.hours * hourlyRate, 0);
}
