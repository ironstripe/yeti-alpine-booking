import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Instructor = Tables<"instructors">;

export type RealTimeStatus = "available" | "on_call" | "unavailable";
export type Specialization = "ski" | "snowboard" | "both";

export function useInstructors() {
  return useQuery({
    queryKey: ["instructors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instructors")
        .select("*")
        .order("last_name", { ascending: true });

      if (error) throw error;
      return data as Instructor[];
    },
  });
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
      };
    case "on_call":
      return {
        label: "Auf Abruf",
        color: "bg-orange-500",
        textColor: "text-orange-700",
        bgLight: "bg-orange-100",
        borderColor: "border-orange-500",
      };
    case "unavailable":
    default:
      return {
        label: "Nicht verfügbar",
        color: "bg-red-500",
        textColor: "text-red-700",
        bgLight: "bg-red-100",
        borderColor: "border-red-500",
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
