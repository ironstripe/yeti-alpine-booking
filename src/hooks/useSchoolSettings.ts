import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

export interface OfficeHours {
  weekdays: { start: string; end: string } | null;
  saturday: { start: string; end: string } | null;
  sunday: { start: string; end: string } | null;
}

export interface LessonTimes {
  morning: { start: string; end: string };
  afternoon: { start: string; end: string };
}

export interface SchoolSettings {
  id: string;
  name: string;
  slogan: string | null;
  logo_url: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  account_holder: string | null;
  vat_number: string | null;
  office_hours: OfficeHours | null;
  lesson_times: LessonTimes | null;
  created_at: string;
  updated_at: string;
}

export function useSchoolSettings() {
  return useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        office_hours: data.office_hours as unknown as OfficeHours | null,
        lesson_times: data.lesson_times as unknown as LessonTimes | null,
      } as SchoolSettings;
    },
  });
}

export function useUpdateSchoolSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<SchoolSettings, "id" | "created_at" | "updated_at">>) => {
      // Transform types for Supabase
      const dbUpdates = {
        ...updates,
        office_hours: updates.office_hours as unknown as Json,
        lesson_times: updates.lesson_times as unknown as Json,
      };

      // Get existing settings first
      const { data: existing } = await supabase
        .from("school_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("school_settings")
          .update(dbUpdates)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("school_settings")
          .insert({ name: "Skischule", ...dbUpdates });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-settings"] });
      toast.success("Einstellungen gespeichert");
    },
    onError: (error) => {
      console.error("Error saving school settings:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}
