import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Event {
  id: string;
  name: string;
  event_date: string;
  event_type: string;
  status: string;
  course_race_time: string;
  guest_race_time: string;
  result_ceremony_time: string;
  instructor_deadline: string | null;
  guest_fee: number;
  total_numbers: number;
  reserve_per_group: number;
  created_at: string;
  updated_at: string;
  // Computed fields
  course_participant_count?: number;
  guest_participant_count?: number;
  total_paid?: number;
}

export interface EventCategory {
  id: string;
  event_id: string;
  name: string;
  category_type: "course" | "guest";
  training_id: string | null;
  discipline: string | null;
  age_group: string | null;
  start_time: string | null;
  sort_order: number;
  start_number_from: number | null;
  start_number_to: number | null;
  color: string | null;
  created_at: string;
}

export interface EventParticipant {
  id: string;
  event_id: string;
  category_id: string;
  participant_id: string | null;
  ticket_item_id: string | null;
  guest_first_name: string | null;
  guest_last_name: string | null;
  guest_birth_year: number | null;
  guest_phone: string | null;
  guest_email: string | null;
  source: "group_course" | "private_course" | "walkin";
  days_attended: number;
  confirmed_by_instructor: string | null;
  opted_out: boolean;
  opt_out_reason: string | null;
  start_number: number | null;
  fee_amount: number | null;
  payment_status: string;
  finish_time_ms: number | null;
  rank_in_category: number | null;
  is_disqualified: boolean;
  disqualification_reason: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  participant?: {
    id: string;
    first_name: string;
    last_name: string | null;
    birth_date: string;
  };
  category?: EventCategory;
  instructor?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false });

      if (error) throw error;
      return data as Event[];
    },
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ["events", eventId],
    queryFn: async () => {
      if (!eventId) throw new Error("Event ID required");

      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (error) throw error;
      return data as Event;
    },
    enabled: !!eventId,
  });
}

export function useEventCategories(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-categories", eventId],
    queryFn: async () => {
      if (!eventId) throw new Error("Event ID required");

      const { data, error } = await supabase
        .from("event_categories")
        .select("*")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as EventCategory[];
    },
    enabled: !!eventId,
  });
}

export function useEventParticipants(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-participants", eventId],
    queryFn: async () => {
      if (!eventId) throw new Error("Event ID required");

      const { data, error } = await supabase
        .from("event_participants")
        .select(`
          *,
          participant:customer_participants(id, first_name, last_name, birth_date),
          category:event_categories(id, name, category_type, color, sort_order),
          instructor:instructors!confirmed_by_instructor(id, first_name, last_name)
        `)
        .eq("event_id", eventId)
        .order("start_number", { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as EventParticipant[];
    },
    enabled: !!eventId,
  });
}

export function useEventWithStats(eventId: string | undefined) {
  const { data: event, ...eventQuery } = useEvent(eventId);
  const { data: participants } = useEventParticipants(eventId);

  const stats = participants
    ? {
        course_participant_count: participants.filter(
          (p) => p.source === "group_course" && !p.opted_out
        ).length,
        guest_participant_count: participants.filter(
          (p) => p.source !== "group_course" && !p.opted_out
        ).length,
        total_paid: participants
          .filter((p) => p.payment_status === "paid")
          .reduce((sum, p) => sum + (p.fee_amount || 0), 0),
      }
    : null;

  return {
    ...eventQuery,
    data: event ? { ...event, ...stats } : undefined,
    participants,
  };
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventData: { event_date: string; name?: string }) => {
      const { data, error } = await supabase
        .from("events")
        .insert(eventData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Event erstellt");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Erstellen", { description: error.message });
    },
  });
}

export function useCreateNextFridayEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_next_friday_race_event");

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Wöchentliches Rennen erstellt");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Erstellen", { description: error.message });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Event> & { id: string }) => {
      const { data, error } = await supabase
        .from("events")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", variables.id] });
      toast.success("Event aktualisiert");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Aktualisieren", { description: error.message });
    },
  });
}

export function useCreateEventCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (categoryData: {
      event_id: string;
      name: string;
      category_type: "course" | "guest";
      training_id?: string | null;
      discipline?: "ski" | "snowboard" | null;
      age_group?: "child" | "adult" | null;
      start_time?: string | null;
      sort_order?: number;
      start_number_from?: number | null;
      start_number_to?: number | null;
      color?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("event_categories")
        .insert(categoryData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["event-categories", variables.event_id],
      });
      toast.success("Kategorie erstellt");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Erstellen", { description: error.message });
    },
  });
}

export function useCreateEventParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (participantData: {
      event_id: string;
      category_id: string;
      source: "group_course" | "private_course" | "walkin";
      participant_id?: string | null;
      ticket_item_id?: string | null;
      guest_first_name?: string | null;
      guest_last_name?: string | null;
      guest_birth_year?: number | null;
      guest_phone?: string | null;
      guest_email?: string | null;
      days_attended?: number;
      confirmed_by_instructor?: string | null;
      fee_amount?: number | null;
      payment_status?: string;
    }) => {
      const { data, error } = await supabase
        .from("event_participants")
        .insert(participantData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["event-participants", variables.event_id],
      });
      toast.success("Teilnehmer hinzugefügt");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Hinzufügen", { description: error.message });
    },
  });
}

export function useUpdateEventParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      event_id,
      ...updates
    }: Partial<EventParticipant> & { id: string; event_id: string }) => {
      const { data, error } = await supabase
        .from("event_participants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, event_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["event-participants", data.event_id],
      });
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Aktualisieren", { description: error.message });
    },
  });
}

export function useDeleteEventParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      event_id,
    }: {
      id: string;
      event_id: string;
    }) => {
      const { error } = await supabase
        .from("event_participants")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { event_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["event-participants", data.event_id],
      });
      toast.success("Teilnehmer entfernt");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Entfernen", { description: error.message });
    },
  });
}

export function useBulkUpdateStartNumbers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      event_id,
      updates,
    }: {
      event_id: string;
      updates: { id: string; start_number: number }[];
    }) => {
      // Update each participant's start number
      for (const update of updates) {
        const { error } = await supabase
          .from("event_participants")
          .update({ start_number: update.start_number })
          .eq("id", update.id);

        if (error) throw error;
      }
      return { event_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["event-participants", data.event_id],
      });
      toast.success("Startnummern zugewiesen");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Zuweisen", { description: error.message });
    },
  });
}

export function useBulkUpdateResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      event_id,
      updates,
    }: {
      event_id: string;
      updates: {
        id: string;
        finish_time_ms: number | null;
        rank_in_category: number | null;
        is_disqualified: boolean;
      }[];
    }) => {
      for (const update of updates) {
        const { error } = await supabase
          .from("event_participants")
          .update({
            finish_time_ms: update.finish_time_ms,
            rank_in_category: update.rank_in_category,
            is_disqualified: update.is_disqualified,
          })
          .eq("id", update.id);

        if (error) throw error;
      }
      return { event_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["event-participants", data.event_id],
      });
      toast.success("Ergebnisse gespeichert");
    },
    onError: (error: Error) => {
      toast.error("Fehler beim Speichern", { description: error.message });
    },
  });
}
