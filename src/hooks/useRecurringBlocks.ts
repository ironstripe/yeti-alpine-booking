import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export interface RecurringBlock {
  id: string;
  instructor_id: string;
  start_time: string;
  end_time: string;
  weekdays: number[];
  valid_from: string;
  valid_until: string | null;
  reason: string | null;
  preset_type: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BookingConflict {
  booking_id: string;
  booking_date: string;
  time_start: string;
  time_end: string;
  participant_name: string;
}

export function useRecurringBlocks(instructorId: string | null) {
  return useQuery({
    queryKey: ["recurring-blocks", instructorId],
    queryFn: async () => {
      if (!instructorId) return [];

      const { data, error } = await supabase
        .from("instructor_recurring_blocks")
        .select("*")
        .eq("instructor_id", instructorId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as RecurringBlock[];
    },
    enabled: !!instructorId,
  });
}

export function useRecurringBlockConflicts(
  instructorId: string | null,
  startTime: string,
  endTime: string,
  weekdays: number[],
  validFrom: string,
  validUntil: string | null
) {
  return useQuery({
    queryKey: ["recurring-block-conflicts", instructorId, startTime, endTime, weekdays, validFrom, validUntil],
    queryFn: async () => {
      if (!instructorId || !startTime || !endTime || weekdays.length === 0 || !validFrom) {
        return [];
      }

      const { data, error } = await supabase.rpc("check_recurring_block_conflicts", {
        p_instructor_id: instructorId,
        p_start_time: startTime,
        p_end_time: endTime,
        p_weekdays: weekdays,
        p_valid_from: validFrom,
        p_valid_until: validUntil,
      });

      if (error) throw error;
      return data as BookingConflict[];
    },
    enabled: !!instructorId && !!startTime && !!endTime && weekdays.length > 0 && !!validFrom,
  });
}

export function useCreateRecurringBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (block: {
      instructor_id: string;
      start_time: string;
      end_time: string;
      weekdays: number[];
      valid_from: string;
      valid_until: string | null;
      reason: string | null;
      preset_type: string | null;
    }) => {
      const { error } = await supabase.from("instructor_recurring_blocks").insert({
        ...block,
        status: "pending",
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["pending-recurring-blocks"] });
      toast.success("Antrag eingereicht", {
        description: "Dein wiederkehrender Block wurde zur Genehmigung eingereicht.",
      });
    },
    onError: (error) => {
      console.error("Error creating recurring block:", error);
      toast.error("Fehler beim Erstellen des wiederkehrenden Blocks");
    },
  });
}

export function useUpdateRecurringBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      blockId,
      updates,
    }: {
      blockId: string;
      updates: Partial<{
        start_time: string;
        end_time: string;
        weekdays: number[];
        valid_from: string;
        valid_until: string | null;
        reason: string | null;
        preset_type: string | null;
      }>;
    }) => {
      const { error } = await supabase
        .from("instructor_recurring_blocks")
        .update({
          ...updates,
          status: "pending", // Reset to pending for re-approval
        })
        .eq("id", blockId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["pending-recurring-blocks"] });
      toast.success("Änderung eingereicht", {
        description: "Deine Änderung wurde zur Genehmigung eingereicht.",
      });
    },
    onError: (error) => {
      console.error("Error updating recurring block:", error);
      toast.error("Fehler beim Aktualisieren");
    },
  });
}

export function useDeleteRecurringBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase
        .from("instructor_recurring_blocks")
        .update({ is_active: false })
        .eq("id", blockId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["pending-recurring-blocks"] });
      toast.success("Block gelöscht");
    },
    onError: (error) => {
      console.error("Error deleting recurring block:", error);
      toast.error("Fehler beim Löschen");
    },
  });
}

// Approval hooks for admins
export interface PendingRecurringBlock extends RecurringBlock {
  instructor_name: string;
  instructor_email: string;
}

export function usePendingRecurringBlocks() {
  return useQuery({
    queryKey: ["pending-recurring-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructor_recurring_blocks")
        .select(`
          *,
          instructors!inner (
            first_name,
            last_name,
            email
          )
        `)
        .eq("status", "pending")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return data.map((row): PendingRecurringBlock => ({
        id: row.id,
        instructor_id: row.instructor_id,
        start_time: row.start_time,
        end_time: row.end_time,
        weekdays: row.weekdays,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        reason: row.reason,
        preset_type: row.preset_type,
        status: row.status as "pending" | "approved" | "rejected",
        rejection_reason: row.rejection_reason,
        is_active: row.is_active,
        created_at: row.created_at,
        instructor_name: `${row.instructors.first_name} ${row.instructors.last_name}`,
        instructor_email: row.instructors.email,
      }));
    },
  });
}

export function useApproveRecurringBlock() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase
        .from("instructor_recurring_blocks")
        .update({
          status: "approved",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", blockId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-recurring-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["recurring-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["scheduler-recurring-blocks"] });
      toast.success("Wiederkehrender Block genehmigt");
    },
    onError: (error) => {
      console.error("Failed to approve recurring block:", error);
      toast.error("Fehler beim Genehmigen");
    },
  });
}

export function useRejectRecurringBlock() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ blockId, reason }: { blockId: string; reason: string }) => {
      const { error } = await supabase
        .from("instructor_recurring_blocks")
        .update({
          status: "rejected",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq("id", blockId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-recurring-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["recurring-blocks"] });
      toast.success("Wiederkehrender Block abgelehnt");
    },
    onError: (error) => {
      console.error("Failed to reject recurring block:", error);
      toast.error("Fehler beim Ablehnen");
    },
  });
}
