import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { toast } from "sonner";

export type Instructor = Tables<"instructors">;
export type TicketItem = Tables<"ticket_items">;

export interface TodayBooking {
  id: string;
  time_start: string | null;
  time_end: string | null;
  status: string | null;
  instructor_confirmation: string | null;
  participant_name: string | null;
  product_name: string | null;
  product_type: string | null;
}

export interface SeasonStats {
  bookedHours: number;
  confirmedHours: number;
  pendingHours: number;
  grossEarnings: number;
}

export function useInstructorDetail(id: string | undefined) {
  const queryClient = useQueryClient();
  const [isPulsing, setIsPulsing] = useState(false);
  const [externalChange, setExternalChange] = useState(false);

  const instructorQuery = useQuery({
    queryKey: ["instructor", id],
    queryFn: async () => {
      if (!id) throw new Error("No instructor ID provided");

      const { data, error } = await supabase
        .from("instructors")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Instructor not found");

      return data as Instructor;
    },
    enabled: !!id,
  });

  const todayBookingsQuery = useQuery({
    queryKey: ["instructor-today-bookings", id],
    queryFn: async () => {
      if (!id) return [];

      const today = format(new Date(), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          time_start,
          time_end,
          status,
          instructor_confirmation,
          participant_id,
          product_id,
          products (name, type),
          customer_participants (first_name, last_name)
        `)
        .eq("instructor_id", id)
        .eq("date", today)
        .order("time_start", { ascending: true });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        time_start: item.time_start,
        time_end: item.time_end,
        status: item.status,
        instructor_confirmation: item.instructor_confirmation,
        participant_name: item.customer_participants
          ? `${item.customer_participants.first_name} ${item.customer_participants.last_name || ""}`.trim()
          : null,
        product_name: item.products?.name || null,
        product_type: item.products?.type || null,
      })) as TodayBooking[];
    },
    enabled: !!id,
  });

  const seasonStatsQuery = useQuery({
    queryKey: ["instructor-season-stats", id],
    queryFn: async () => {
      if (!id) return { bookedHours: 0, confirmedHours: 0, pendingHours: 0, grossEarnings: 0 };

      // Season start: December 1st of previous year or current year
      const now = new Date();
      const seasonStart = now.getMonth() >= 11
        ? new Date(now.getFullYear(), 11, 1)
        : new Date(now.getFullYear() - 1, 11, 1);

      const { data, error } = await supabase
        .from("ticket_items")
        .select("time_start, time_end, instructor_confirmation, unit_price, quantity")
        .eq("instructor_id", id)
        .gte("date", format(seasonStart, "yyyy-MM-dd"));

      if (error) throw error;

      let bookedMinutes = 0;
      let confirmedMinutes = 0;
      let pendingMinutes = 0;
      let grossEarnings = 0;

      (data || []).forEach((item) => {
        // Calculate duration from time_start and time_end
        let minutes = 60; // Default 1 hour
        if (item.time_start && item.time_end) {
          const [startH, startM] = item.time_start.split(":").map(Number);
          const [endH, endM] = item.time_end.split(":").map(Number);
          minutes = (endH * 60 + endM) - (startH * 60 + startM);
        }

        bookedMinutes += minutes;
        
        if (item.instructor_confirmation === "confirmed") {
          confirmedMinutes += minutes;
          grossEarnings += (item.unit_price || 0) * (item.quantity || 1);
        } else if (item.instructor_confirmation === "pending") {
          pendingMinutes += minutes;
        }
      });

      return {
        bookedHours: Math.round(bookedMinutes / 60),
        confirmedHours: Math.round(confirmedMinutes / 60),
        pendingHours: Math.round(pendingMinutes / 60),
        grossEarnings,
      } as SeasonStats;
    },
    enabled: !!id,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      if (!id) throw new Error("No instructor ID");

      const { error } = await supabase
        .from("instructors")
        .update({ real_time_status: newStatus })
        .eq("id", id);

      if (error) throw error;
      return newStatus;
    },
    onSuccess: () => {
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 1000);
      queryClient.invalidateQueries({ queryKey: ["instructor", id] });
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    },
    onError: (error) => {
      toast.error("Fehler beim Aktualisieren des Status");
      console.error(error);
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`instructor-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "instructors",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const oldData = payload.old as Partial<Instructor>;
          const newData = payload.new as Instructor;

          // Check if this was an external change (not from our mutation)
          if (oldData.real_time_status !== newData.real_time_status) {
            setIsPulsing(true);
            setExternalChange(true);
            setTimeout(() => {
              setIsPulsing(false);
              setExternalChange(false);
            }, 3000);
            toast.info("Status wurde von einem anderen Gerät geändert");
          }

          queryClient.invalidateQueries({ queryKey: ["instructor", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  return {
    instructor: instructorQuery.data,
    isLoading: instructorQuery.isLoading,
    error: instructorQuery.error,
    todayBookings: todayBookingsQuery.data || [],
    seasonStats: seasonStatsQuery.data,
    isPulsing,
    externalChange,
    updateStatus: updateStatusMutation.mutate,
    isUpdatingStatus: updateStatusMutation.isPending,
  };
}
