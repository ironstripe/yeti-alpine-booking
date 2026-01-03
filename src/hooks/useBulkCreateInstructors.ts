import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

type InstructorInsert = TablesInsert<"instructors">;

export interface BulkCreateResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

export function useBulkCreateInstructors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instructors: InstructorInsert[]): Promise<BulkCreateResult> => {
      const result: BulkCreateResult = {
        success: 0,
        failed: 0,
        errors: [],
      };

      // Insert in batches of 50 to avoid timeouts
      const batchSize = 50;
      
      for (let i = 0; i < instructors.length; i += batchSize) {
        const batch = instructors.slice(i, i + batchSize);
        
        const { data, error } = await supabase
          .from("instructors")
          .insert(batch)
          .select();

        if (error) {
          // If batch fails, try individual inserts to identify which ones failed
          for (let j = 0; j < batch.length; j++) {
            const instructor = batch[j];
            const { error: singleError } = await supabase
              .from("instructors")
              .insert(instructor)
              .select()
              .single();

            if (singleError) {
              result.failed++;
              let errorMessage = singleError.message;
              
              // Check for unique constraint violations
              if (singleError.code === "23505") {
                if (singleError.message.includes("email")) {
                  errorMessage = "E-Mail bereits vorhanden";
                } else if (singleError.message.includes("phone")) {
                  errorMessage = "Telefonnummer bereits vorhanden";
                } else {
                  errorMessage = "Duplikat gefunden";
                }
              }
              
              result.errors.push({
                row: i + j + 1,
                email: instructor.email,
                error: errorMessage,
              });
            } else {
              result.success++;
            }
          }
        } else {
          result.success += data?.length || 0;
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    },
  });
}
