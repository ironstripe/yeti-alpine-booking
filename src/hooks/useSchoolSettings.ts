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

export const SCHOOL_LOGO_BUCKET = "school-logos";

/** Uploads a logo (PNG/SVG, max 2MB) to the private bucket and stores its reference. */
export function useUploadSchoolLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!["image/png", "image/svg+xml"].includes(file.type)) throw new Error("Nur PNG oder SVG erlaubt");
      if (file.size > 2 * 1024 * 1024) throw new Error("Datei ist grösser als 2 MB");
      const ext = file.type === "image/png" ? "png" : "svg";
      const path = `logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(SCHOOL_LOGO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const ref = `${SCHOOL_LOGO_BUCKET}:${path}`;
      const { data: existing } = await supabase.from("school_settings").select("id").limit(1).maybeSingle();
      const { error } = existing
        ? await supabase.from("school_settings").update({ logo_url: ref }).eq("id", existing.id)
        : await supabase.from("school_settings").insert({ name: "Skischule", logo_url: ref });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-settings"] });
      toast.success("Logo gespeichert");
    },
    onError: (error: Error) => {
      console.error("Error uploading logo:", error);
      toast.error(`Logo-Upload fehlgeschlagen: ${error.message}`);
    },
  });
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

      // logo_url may hold a path in the private "school-logos" bucket → resolve to a signed URL
      let logoUrl = data.logo_url as string | null;
      if (logoUrl && logoUrl.startsWith(`${SCHOOL_LOGO_BUCKET}:`)) {
        const path = logoUrl.slice(SCHOOL_LOGO_BUCKET.length + 1);
        const { data: signed } = await supabase.storage
          .from(SCHOOL_LOGO_BUCKET)
          .createSignedUrl(path, 60 * 60 * 12);
        logoUrl = signed?.signedUrl ?? null;
      }

      return {
        ...data,
        logo_url: logoUrl,
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
