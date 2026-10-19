import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveInstructor } from "@/lib/instructorsApi";
import type { InstructorWithBookings } from "@/hooks/useInstructors";

/**
 * Inline list edits. Three independent values, three separate existing server paths:
 * - Saisonstatus (status) and Operativer Status (real_time_status) → staff RPC instructor_ops_upsert
 * - Homepage visibility (show_on_website) → staff Edge Function instructor-website-publish
 * None of them changes another.
 */
export function useInstructorListEdits() {
  const queryClient = useQueryClient();
  const refresh = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ["instructors"] });
    queryClient.invalidateQueries({ queryKey: ["instructor", id] });
  };

  const field = useMutation({
    mutationFn: async (v: { id: string; status?: "active" | "inactive"; real_time_status?: string }) => {
      await saveInstructor(v);
      return v.id;
    },
    onSuccess: (id) => { refresh(id); toast.success("Gespeichert"); },
    onError: (e) => toast.error("Speichern fehlgeschlagen", { description: e instanceof Error ? e.message : undefined }),
  });

  const website = useMutation({
    mutationFn: async ({ instructor, show }: { instructor: InstructorWithBookings; show: boolean }) => {
      const { data, error } = await supabase.functions.invoke("instructor-website-publish", {
        body: { instructor_id: instructor.id, show_on_website: show, website_teaser: instructor.website_teaser ?? "" },
      });
      if (error || !data?.ok) throw error ?? new Error(data?.error || "website_publish_failed");
      return instructor.id;
    },
    onSuccess: (id, v) => { refresh(id); toast.success(v.show ? "Auf Homepage sichtbar" : "Von Homepage ausgeblendet"); },
    onError: () => toast.error("Homepage-Sichtbarkeit konnte nicht geändert werden."),
  });

  return { field, website };
}

export { homepageBlocker } from "@/hooks/homepageBlocker";
