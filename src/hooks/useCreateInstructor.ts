import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

type InstructorInsert = TablesInsert<"instructors">;

export function useCreateInstructor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instructor: InstructorInsert) => {
      const { data, error } = await supabase
        .from("instructors")
        .insert(instructor)
        .select()
        .single();

      if (error) {
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

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    },
  });
}
