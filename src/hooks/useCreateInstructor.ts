import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveInstructor } from "@/lib/instructorsApi";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import type { TablesInsert } from "@/integrations/supabase/types";

type InstructorInsert = TablesInsert<"instructors">;

export function useCreateInstructor() {
  const queryClient = useQueryClient();
  const withPay = useIsSuperAdmin();

  return useMutation({
    mutationFn: async (instructor: InstructorInsert) => {
      let id: string;
      try {
        id = await saveInstructor(instructor as Record<string, unknown>, { withPay: withPay });
      } catch (e) {
        const error = e as { code?: string; message: string };
        // Check for unique constraint violations
        if (error.code === "23505") {
          if (error.message.includes("email")) {
            throw new Error("Diese E-Mail-Adresse wird bereits verwendet.");
          }
          if (error.message.includes("phone")) {
            throw new Error("Diese Telefonnummer wird bereits verwendet.");
          }
          throw new Error("Ein Eintrag mit diesen Daten existiert bereits.");
        }
        throw error;
      }

      return { id, email: instructor.email ?? null, roles: instructor.roles ?? [] };
    },
    onSuccess: async (data) => {
      // Try to link pre-existing auth user to this instructor's roles
      try {
        await supabase.functions.invoke("link-instructor-to-user", {
          body: {
            email: data.email,
            roles: data.roles,
          },
        });
      } catch (linkError) {
        // Non-critical - log but don't fail the mutation
        console.warn("Could not link instructor to auth user:", linkError);
      }

      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    },
  });
}
