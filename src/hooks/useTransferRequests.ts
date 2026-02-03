import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

export interface TransferRequest {
  id: string;
  status: string;
  createdAt: string;
  participantId: string;
  participantName: string;
  sourceGroupName: string;
  sourceInstructorName: string | null;
  targetGroupName: string;
  targetInstructorName: string | null;
  isIncoming: boolean; // true if current user is target instructor
}

export function useTransferRequests() {
  const { instructorId, loading: roleLoading } = useUserRole();
  const queryClient = useQueryClient();

  // Fetch all transfer requests involving current instructor
  const requestsQuery = useQuery({
    queryKey: ["transfer-requests", instructorId],
    queryFn: async (): Promise<TransferRequest[]> => {
      if (!instructorId) return [];

      // Get requests where instructor is either source (requesting) or target
      const { data, error } = await supabase
        .from("participant_transfer_requests")
        .select(`
          id,
          status,
          created_at,
          participant_id,
          requesting_instructor_id,
          source_group:source_group_id (
            id,
            instructor_id,
            group_courses (name),
            source_instructor:instructor_id (first_name, last_name)
          ),
          target_group:target_group_id (
            id,
            instructor_id,
            group_courses (name),
            target_instructor:instructor_id (first_name, last_name)
          ),
          participant:participant_id (
            first_name,
            last_name
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter and map requests
      return (data || [])
        .filter((req: any) => {
          const isSource = req.requesting_instructor_id === instructorId;
          const isTarget = req.target_group?.instructor_id === instructorId;
          return isSource || isTarget;
        })
        .map((req: any) => {
          const isTarget = req.target_group?.instructor_id === instructorId;
          const sourceInstructor = req.source_group?.source_instructor;
          const targetInstructor = req.target_group?.target_instructor;

          return {
            id: req.id,
            status: req.status,
            createdAt: req.created_at,
            participantId: req.participant_id,
            participantName: req.participant
              ? `${req.participant.first_name} ${req.participant.last_name || ""}`.trim()
              : "Unbekannt",
            sourceGroupName: req.source_group?.group_courses?.name || "Unbekannt",
            sourceInstructorName: sourceInstructor
              ? `${sourceInstructor.first_name} ${sourceInstructor.last_name}`
              : null,
            targetGroupName: req.target_group?.group_courses?.name || "Unbekannt",
            targetInstructorName: targetInstructor
              ? `${targetInstructor.first_name} ${targetInstructor.last_name}`
              : null,
            isIncoming: isTarget,
          };
        });
    },
    enabled: !!instructorId && !roleLoading,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Count of pending incoming requests (for badge)
  const pendingIncomingCount = (requestsQuery.data || []).filter(
    (r) => r.isIncoming && r.status === "pending"
  ).length;

  // Create transfer request mutation
  const createTransferMutation = useMutation({
    mutationFn: async ({
      sourceGroupId,
      targetGroupId,
      participantId,
    }: {
      sourceGroupId: string;
      targetGroupId: string;
      participantId: string;
    }) => {
      const { data, error } = await supabase.rpc("create_participant_transfer_request", {
        p_source_group_id: sourceGroupId,
        p_target_group_id: targetGroupId,
        p_participant_id: participantId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Anfrage gesendet", {
        description: "Der Gruppenleiter wurde benachrichtigt.",
      });
      queryClient.invalidateQueries({ queryKey: ["transfer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["live-planning-my-groups"] });
    },
    onError: (error: any) => {
      console.error("Transfer request error:", error);
      toast.error("Fehler", {
        description: error.message || "Anfrage konnte nicht gesendet werden.",
      });
    },
  });

  // Respond to transfer request mutation
  const respondToTransferMutation = useMutation({
    mutationFn: async ({
      requestId,
      response,
    }: {
      requestId: string;
      response: "accepted" | "rejected";
    }) => {
      const { data, error } = await supabase.rpc("respond_to_participant_transfer", {
        p_request_id: requestId,
        p_response: response,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      if (variables.response === "accepted") {
        toast.success("Transfer akzeptiert", {
          description: "Der Teilnehmer wurde in deine Gruppe verschoben.",
        });
      } else {
        toast.info("Transfer abgelehnt");
      }
      queryClient.invalidateQueries({ queryKey: ["transfer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["live-planning-my-groups"] });
      queryClient.invalidateQueries({ queryKey: ["live-planning-other-groups"] });
    },
    onError: (error: any) => {
      console.error("Respond to transfer error:", error);
      toast.error("Fehler", {
        description: error.message || "Antwort konnte nicht gesendet werden.",
      });
    },
  });

  // Cancel transfer request mutation
  const cancelTransferMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc("cancel_participant_transfer_request", {
        p_request_id: requestId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Anfrage zurückgezogen");
      queryClient.invalidateQueries({ queryKey: ["transfer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["live-planning-my-groups"] });
    },
    onError: (error: any) => {
      console.error("Cancel transfer error:", error);
      toast.error("Fehler", {
        description: error.message || "Anfrage konnte nicht zurückgezogen werden.",
      });
    },
  });

  return {
    requests: requestsQuery.data || [],
    incomingRequests: (requestsQuery.data || []).filter((r) => r.isIncoming),
    outgoingRequests: (requestsQuery.data || []).filter((r) => !r.isIncoming),
    pendingIncomingCount,
    isLoading: roleLoading || requestsQuery.isLoading,
    createTransfer: createTransferMutation.mutateAsync,
    isCreating: createTransferMutation.isPending,
    respondToTransfer: respondToTransferMutation.mutateAsync,
    isResponding: respondToTransferMutation.isPending,
    cancelTransfer: cancelTransferMutation.mutateAsync,
    isCanceling: cancelTransferMutation.isPending,
    refetch: requestsQuery.refetch,
  };
}
