import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const DEFAULT_TEASER =
  "Mit Freude, Geduld und Begeisterung begleite ich Kinder und Erwachsene auf ihrem Weg im Schnee – vom ersten Schwung bis zum nächsten persönlichen Erfolg.";

export const PORTRAIT_BUCKET = "website-instructor-portraits";

export type PublicProfileStatus = "draft" | "published" | "hidden";

export interface InstructorPublicProfile {
  id: string;
  instructor_id: string;
  public_display_name: string | null;
  public_role_label: string | null;
  teaser_draft: string;
  teaser_published: string | null;
  portrait_url: string | null;
  portrait_storage_path: string | null;
  photo_consent_confirmed_at: string | null;
  status: PublicProfileStatus;
  sort_order: number;
  published_at: string | null;
  published_by: string | null;
}

export function useInstructorPublicProfile(instructorId?: string) {
  return useQuery({
    queryKey: ["instructor-public-profile", instructorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_public_profiles")
        .select("*")
        .eq("instructor_id", instructorId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as InstructorPublicProfile) ?? null;
    },
    enabled: !!instructorId,
  });
}

export function useSaveInstructorPublicProfile(instructorId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: Partial<InstructorPublicProfile>) => {
      const { data, error } = await supabase
        .from("instructor_public_profiles")
        .upsert(
          { instructor_id: instructorId!, ...values } as never,
          { onConflict: "instructor_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data as unknown as InstructorPublicProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructor-public-profile", instructorId] });
    },
    onError: (error) => {
      toast.error("Fehler beim Speichern des Website-Profils", {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}

const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validatePortraitFile(file: File): string | null {
  if (!EXT_MAP[file.type]) return "Nur JPG, PNG oder WebP sind erlaubt.";
  if (file.size > 5 * 1024 * 1024) return "Die Datei darf maximal 5 MB gross sein.";
  return null;
}

export async function uploadPortrait(instructorId: string, file: File) {
  const ext = EXT_MAP[file.type] ?? "jpg";
  const path = `${instructorId}/portrait.${ext}`;

  const { error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  const { data: signed, error: signErr } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr) throw signErr;

  return { path, url: signed.signedUrl };
}

export async function removeStoredPortrait(path: string) {
  await supabase.storage.from(PORTRAIT_BUCKET).remove([path]);
}
