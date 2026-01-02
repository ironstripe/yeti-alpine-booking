import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CreateParticipantData {
  customer_id: string;
  first_name: string;
  last_name?: string | null;
  birth_date: string;
  level_last_season?: string | null;
  level_current_season?: string | null;
  sport?: string | null;
  notes?: string | null;
}

export interface UpdateParticipantData {
  first_name?: string;
  last_name?: string | null;
  birth_date?: string;
  level_last_season?: string | null;
  level_current_season?: string | null;
  sport?: string | null;
  notes?: string | null;
}

export function useCreateParticipant(customerId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateParticipantData) => {
      const { error } = await supabase
        .from("customer_participants")
        .insert(data);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast({
        title: "Teilnehmer hinzugefügt",
        description: "Der Teilnehmer wurde erfolgreich erstellt.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Teilnehmer konnte nicht erstellt werden.",
        variant: "destructive",
      });
      console.error("Create participant error:", error);
    },
  });
}

export function useUpdateParticipant(customerId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ participantId, data }: { participantId: string; data: UpdateParticipantData }) => {
      const { error } = await supabase
        .from("customer_participants")
        .update(data)
        .eq("id", participantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast({
        title: "Teilnehmer aktualisiert",
        description: "Die Änderungen wurden gespeichert.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Teilnehmer konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
      console.error("Update participant error:", error);
    },
  });
}

export function useDeleteParticipant(customerId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (participantId: string) => {
      const { error } = await supabase
        .from("customer_participants")
        .delete()
        .eq("id", participantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast({
        title: "Teilnehmer gelöscht",
        description: "Der Teilnehmer wurde entfernt.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Teilnehmer konnte nicht gelöscht werden.",
        variant: "destructive",
      });
      console.error("Delete participant error:", error);
    },
  });
}
