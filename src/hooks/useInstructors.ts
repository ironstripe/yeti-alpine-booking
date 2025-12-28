import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

export type Instructor = Tables<"instructors">;
export type InstructorWithBookings = Instructor & { todayBookingsCount: number };

export type RealTimeStatus = "available" | "on_call" | "unavailable";
export type Specialization = "ski" | "snowboard" | "both";

export function useInstructors() {
  const queryClient = useQueryClient();
  const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ["instructors"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      // Fetch instructors
      const { data: instructors, error } = await supabase
        .from("instructors")
        .select("*")
        .order("last_name", { ascending: true });

      if (error) throw error;

      // Fetch today's bookings count per instructor
      const { data: bookings, error: bookingsError } = await supabase
        .from("ticket_items")
        .select("instructor_id")
        .eq("date", today)
        .not("instructor_id", "is", null);

      if (bookingsError) throw bookingsError;

      // Count bookings per instructor
      const bookingCounts: Record<string, number> = {};
      bookings?.forEach((b) => {
        if (b.instructor_id) {
          bookingCounts[b.instructor_id] = (bookingCounts[b.instructor_id] || 0) + 1;
        }
      });

      // Merge booking counts with instructors
      return (instructors as Instructor[]).map((instructor) => ({
        ...instructor,
        todayBookingsCount: bookingCounts[instructor.id] || 0,
      })) as InstructorWithBookings[];
    },
  });

  // Realtime subscription for status updates
  useEffect(() => {
    const channel = supabase
      .channel("instructors-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "instructors",
        },
        (payload) => {
          const updatedInstructor = payload.new as Instructor;
          const oldInstructor = payload.old as Partial<Instructor>;

          // If real_time_status changed, trigger pulse animation
          if (oldInstructor.real_time_status !== updatedInstructor.real_time_status) {
            setPulsingIds((prev) => new Set(prev).add(updatedInstructor.id));
            setTimeout(() => {
              setPulsingIds((prev) => {
                const next = new Set(prev);
                next.delete(updatedInstructor.id);
                return next;
              });
            }, 1000);
          }

          // Invalidate query to refetch data
          queryClient.invalidateQueries({ queryKey: ["instructors"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { ...query, pulsingIds };
}

export function getStatusConfig(status: string | null) {
  switch (status) {
    case "available":
      return {
        label: "Verfügbar",
        color: "bg-green-500",
        textColor: "text-green-700",
        bgLight: "bg-green-100",
        borderColor: "border-green-500",
        shadowColor: "rgba(16, 185, 129, 0.2)",
      };
    case "on_call":
      return {
        label: "Auf Abruf",
        color: "bg-orange-500",
        textColor: "text-orange-700",
        bgLight: "bg-orange-100",
        borderColor: "border-orange-500",
        shadowColor: "rgba(245, 158, 11, 0.2)",
      };
    case "unavailable":
    default:
      return {
        label: "Nicht verfügbar",
        color: "bg-red-500",
        textColor: "text-red-700",
        bgLight: "bg-red-100",
        borderColor: "border-red-500",
        shadowColor: "rgba(239, 68, 68, 0.2)",
      };
  }
}

export function getSpecializationLabel(spec: string | null) {
  switch (spec) {
    case "ski":
      return "Ski";
    case "snowboard":
      return "Snowboard";
    case "both":
      return "Ski & Snowboard";
    default:
      return "Ski";
  }
}
