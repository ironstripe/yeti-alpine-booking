import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchInstructors } from "@/lib/instructorsApi";
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
      const instructors = await fetchInstructors();

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
          event: "*",
          schema: "public",
          table: "instructor_live_status",
        },
        (payload) => {
          // PII-free table: only instructor_id, real_time_status, updated_at.
          const updated = payload.new as { instructor_id?: string; real_time_status?: string | null };
          const old = payload.old as { real_time_status?: string | null };
          const changedId = updated?.instructor_id;

          if (changedId && old?.real_time_status !== updated.real_time_status) {
            setPulsingIds((prev) => new Set(prev).add(changedId));
            setTimeout(() => {
              setPulsingIds((prev) => {
                const next = new Set(prev);
                next.delete(changedId);
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

export function getSpecializationLabel(spec: string | null, roles?: string[] | null): string {
  // If roles provided and only has 'office' role (no teaching), show "Büro"
  if (roles && roles.length > 0) {
    const hasTeachingRole = roles.includes('ski') || roles.includes('snowboard');
    if (!hasTeachingRole) {
      return "Büro";
    }
  }
  
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
