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
      // Invalidate instructor and settings queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["instructor"] });
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
      queryClient.invalidateQueries({ queryKey: ["settings-users"] });
    },
    onError: (error: Error) => {
      // Check for Resend sandbox error
      const isSandboxError = error.message.includes("Testmodus") || 
                             error.message.includes("testing emails") ||
                             error.message.includes("verify a domain");
      
      toast.error("Einladung fehlgeschlagen", {
        description: isSandboxError 
          ? "E-Mail-System im Testmodus. Domain-Verifizierung erforderlich."
          : error.message,
      });
    },
  });
}
