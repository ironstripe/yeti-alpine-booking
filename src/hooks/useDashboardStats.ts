import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useRealtimeSubscription } from "./useRealtimeSubscription";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export interface DashboardStats {
  todayBookings: number;
  availableInstructors: number;
  onCallInstructors: number;
  unreadMessages: number;
  urgentMessages: number;
  todayRevenue: number;
  averageRevenue: number;
}

export function useDashboardStats() {
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  // Realtime subscription for new bookings
  useRealtimeSubscription<Tables<"ticket_items">>({
    table: "ticket_items",
    event: "INSERT",
    queryKey: ["dashboard-stats", today],
    onInsert: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", today] });
      toast.info("Neue Buchung erstellt");
    },
  });

  // Realtime subscription for booking requests
  useRealtimeSubscription<Tables<"booking_requests">>({
    table: "booking_requests",
    event: "INSERT",
    queryKey: ["dashboard-stats", today],
    onInsert: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", today] });
      toast.info("Neue Buchungsanfrage eingegangen");
    },
  });

  // Realtime subscription for conversations
  useRealtimeSubscription<Tables<"conversations">>({
    table: "conversations",
    event: "INSERT",
    queryKey: ["dashboard-stats", today],
    onInsert: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats", today] });
    },
  });

  // Realtime subscription for instructor status changes
  useRealtimeSubscription<Tables<"instructors">>({
    table: "instructors",
    event: "UPDATE",
    queryKey: ["dashboard-stats", today],
  });

  return useQuery({
    queryKey: ["dashboard-stats", today],
    queryFn: async (): Promise<DashboardStats> => {
      // Fetch today's bookings count
      const { count: bookingsCount } = await supabase
        .from("ticket_items")
        .select("*", { count: "exact", head: true })
        .eq("date", today);

      // Fetch instructor status counts
      const { data: instructors } = await supabase
        .from("instructors")
        .select("status, real_time_status");

      const availableInstructors = instructors?.filter(
        (i) => i.status === "active" && i.real_time_status === "available"
      ).length || 0;

      const onCallInstructors = instructors?.filter(
        (i) => i.status === "active" && i.real_time_status === "on_call"
      ).length || 0;

      // Fetch unread messages count
      const { count: unreadCount } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("status", "unread");

      // Count urgent (last hour) unread messages
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: urgentCount } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("status", "unread")
        .gte("created_at", oneHourAgo);

      // Fetch today's revenue from ticket_items
      const { data: todayItems } = await supabase
        .from("ticket_items")
        .select("line_total")
        .eq("date", today);

      const todayRevenue = todayItems?.reduce(
        (sum, item) => sum + (item.line_total || 0), 
        0
      ) || 0;

      // Calculate rough average (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: lastMonthItems } = await supabase
        .from("ticket_items")
        .select("line_total, date")
        .gte("date", format(thirtyDaysAgo, "yyyy-MM-dd"))
        .lt("date", today);

      // Group by date and calculate average
      const dailyTotals: Record<string, number> = {};
      lastMonthItems?.forEach((item) => {
        dailyTotals[item.date] = (dailyTotals[item.date] || 0) + (item.line_total || 0);
      });
      
      const daysWithRevenue = Object.keys(dailyTotals).length;
      const totalRevenue = Object.values(dailyTotals).reduce((a, b) => a + b, 0);
      const averageRevenue = daysWithRevenue > 0 ? totalRevenue / daysWithRevenue : 0;

      return {
        todayBookings: bookingsCount || 0,
        availableInstructors,
        onCallInstructors,
        unreadMessages: unreadCount || 0,
        urgentMessages: urgentCount || 0,
        todayRevenue,
        averageRevenue,
      };
    },
    staleTime: 30000, // Data considered fresh for 30 seconds (reduced from 60s since we have realtime)
    refetchInterval: 120000, // Fallback refetch every 2 minutes
  });
}
