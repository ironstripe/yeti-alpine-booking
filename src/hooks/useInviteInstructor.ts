import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InviteResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

export function useInviteInstructor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instructorId: string): Promise<InviteResponse> => {
      const { data, error } = await supabase.functions.invoke<InviteResponse>(
        "invite-instructor",
        {
          body: { instructor_id: instructorId },
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as InviteResponse;
    },
    onSuccess: (data) => {
      toast.success("Einladung gesendet!", {
        description: data.message,
      });
      // Invalidate instructor queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["instructor"] });
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    },
    onError: (error: Error) => {
      toast.error("Einladung fehlgeschlagen", {
        description: error.message,
      });
    },
  });
}
