import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface HighSeasonPeriod {
  id: string;
  season_id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface ClosureDate {
  id: string;
  season_id: string;
  date: string;
  reason: string | null;
  created_at: string;
}

export function useSeasons() {
  return useQuery({
    queryKey: ["seasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("*")
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data as Season[];
    },
  });
}

export function useCurrentSeason() {
  return useQuery({
    queryKey: ["current-season"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("*")
        .eq("is_current", true)
        .maybeSingle();

      if (error) throw error;
      return data as Season | null;
    },
  });
}

export function useHighSeasonPeriods(seasonId: string | undefined) {
  return useQuery({
    queryKey: ["high-season-periods", seasonId],
    queryFn: async () => {
      if (!seasonId) return [];
      const { data, error } = await supabase
        .from("high_season_periods")
        .select("*")
        .eq("season_id", seasonId)
        .order("start_date");

      if (error) throw error;
      return data as HighSeasonPeriod[];
    },
    enabled: !!seasonId,
  });
}

export function useClosureDates(seasonId: string | undefined) {
  return useQuery({
    queryKey: ["closure-dates", seasonId],
    queryFn: async () => {
      if (!seasonId) return [];
      const { data, error } = await supabase
        .from("closure_dates")
        .select("*")
        .eq("season_id", seasonId)
        .order("date");

      if (error) throw error;
      return data as ClosureDate[];
    },
    enabled: !!seasonId,
  });
}

export function useCreateSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; start_date: string; end_date: string; is_current?: boolean }) => {
      // If this season is current, unset others first
      if (data.is_current) {
        await supabase.from("seasons").update({ is_current: false }).eq("is_current", true);
      }

      const { data: season, error } = await supabase
        .from("seasons")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return season;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      queryClient.invalidateQueries({ queryKey: ["current-season"] });
      toast.success("Saison erstellt");
    },
    onError: (error) => {
      console.error("Error creating season:", error);
      toast.error("Fehler beim Erstellen");
    },
  });
}

export function useUpdateSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Season> & { id: string }) => {
      // If this season is current, unset others first
      if (data.is_current) {
        await supabase.from("seasons").update({ is_current: false }).neq("id", id);
      }

      const { error } = await supabase
        .from("seasons")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      queryClient.invalidateQueries({ queryKey: ["current-season"] });
      toast.success("Saison aktualisiert");
    },
    onError: (error) => {
      console.error("Error updating season:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}

export function useCreateHighSeasonPeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { season_id: string; name: string; start_date: string; end_date: string }) => {
      const { data: period, error } = await supabase
        .from("high_season_periods")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return period;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["high-season-periods", variables.season_id] });
      toast.success("Hochsaison-Periode hinzugefügt");
    },
    onError: (error) => {
      console.error("Error creating high season period:", error);
      toast.error("Fehler beim Erstellen");
    },
  });
}

export function useDeleteHighSeasonPeriod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, seasonId }: { id: string; seasonId: string }) => {
      const { error } = await supabase
        .from("high_season_periods")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return seasonId;
    },
    onSuccess: (seasonId) => {
      queryClient.invalidateQueries({ queryKey: ["high-season-periods", seasonId] });
      toast.success("Periode gelöscht");
    },
    onError: (error) => {
      console.error("Error deleting high season period:", error);
      toast.error("Fehler beim Löschen");
    },
  });
}
