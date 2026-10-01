import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveInstructor } from "@/lib/instructorsApi";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import type { TablesInsert } from "@/integrations/supabase/types";

type InstructorInsert = TablesInsert<"instructors">;

export interface BulkCreateResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

export function useBulkCreateInstructors() {
  const queryClient = useQueryClient();
  const withPay = useIsSuperAdmin();

  return useMutation({
    mutationFn: async (instructors: InstructorInsert[]): Promise<BulkCreateResult> => {
      const result: BulkCreateResult = {
        success: 0,
        failed: 0,
        errors: [],
      };

      for (let i = 0; i < instructors.length; i++) {
        const instructor = instructors[i];
        try {
          await saveInstructor(instructor as Record<string, unknown>, { withPay });
          result.success++;
        } catch (e) {
          const singleError = e as { code?: string; message: string };
          result.failed++;
          let errorMessage = singleError.message;
          if (singleError.code === "23505") {
            if (singleError.message.includes("email")) errorMessage = "E-Mail bereits vorhanden";
            else if (singleError.message.includes("phone")) errorMessage = "Telefonnummer bereits vorhanden";
            else errorMessage = "Duplikat gefunden";
          }
          result.errors.push({ row: i + 1, email: instructor.email ?? "", error: errorMessage });
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    },
  });
}
