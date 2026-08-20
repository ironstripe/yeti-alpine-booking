import { Badge } from "@/components/ui/badge";
import { Banknote, UserPlus, Mail, Users2, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardTaskCard } from "./DashboardTaskCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnassignedGroupsCheck } from "@/hooks/useUnassignedGroupsCheck";
import { usePendingReturnsCount } from "@/hooks/useRentals";

interface ActionCounts {
  overduePayments: number;
  unassignedInstructors: number;
  pendingConfirmations: number;
}

export function ActionRequiredBox() {
  const navigate = useNavigate();

  const { data: actions, isLoading } = useQuery({
    queryKey: ["action-counts-dashboard"],
    queryFn: async (): Promise<ActionCounts> => {
      // Tickets with an open balance (paid < total), excluding cancelled ones
      const { data: unpaidTickets } = await supabase
        .from("tickets")
        .select("id, total_amount, paid_amount")
        .neq("status", "cancelled")
        .gt("total_amount", 0);

      const overduePayments = (unpaidTickets || []).filter(
        (t) => (t.paid_amount || 0) < (t.total_amount || 0)
      ).length;

      // Unassigned lessons: only active items from today onwards
      const today = new Date().toISOString().split("T")[0];
      const { count: unassignedInstructors } = await supabase
        .from("ticket_items")
        .select("id", { count: "exact", head: true })
        .is("instructor_id", null)
        .neq("status", "cancelled")
        .gte("date", today);

      const { count: pendingConfirmations } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_confirmation");

      return {
        overduePayments: overduePayments || 0,
        unassignedInstructors: unassignedInstructors || 0,
        pendingConfirmations: pendingConfirmations || 0,
      };
    },
  });

  const { data: unassignedGroups } = useUnassignedGroupsCheck();
  const unassignedGroupCount = unassignedGroups?.length || 0;

  const { data: pendingReturnsCount } = usePendingReturnsCount();

  if (isLoading) {
    return (
      <DashboardTaskCard title="Handlungsbedarf" count={0}>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </DashboardTaskCard>
    );
  }

  const total = actions
    ? actions.overduePayments + actions.unassignedInstructors + actions.pendingConfirmations + unassignedGroupCount + (pendingReturnsCount || 0)
    : unassignedGroupCount + (pendingReturnsCount || 0);

  const actionItems = [
    {
      icon: Banknote,
      label: "Zahlungen ausstehend",
      count: actions?.overduePayments || 0,
      onClick: () => navigate("/bookings?payment=overdue"),
      color: "text-amber-600",
    },
    {
      icon: UserPlus,
      label: "Lehrer nicht zugewiesen",
      count: actions?.unassignedInstructors || 0,
      onClick: () => navigate("/scheduler"),
      color: "text-blue-600",
    },
    {
      icon: Mail,
      label: "Bestätigung ausstehend",
      count: actions?.pendingConfirmations || 0,
      onClick: () => navigate("/bookings?status=pending_confirmation"),
      color: "text-purple-600",
    },
    {
      icon: Users2,
      label: "Gruppen ohne Lehrer",
      count: unassignedGroupCount,
      onClick: () => {
        if (unassignedGroups && unassignedGroups.length > 0) {
          const firstGroup = unassignedGroups[0];
          navigate(`/trainings/planning?week=${firstGroup.weekStart}`);
        } else {
          navigate("/trainings/planning");
        }
      },
      color: "text-orange-600",
    },
    {
      icon: Package,
      label: "Rückgaben zur Kontrolle",
      count: pendingReturnsCount || 0,
      onClick: () => navigate("/rentals"),
      color: "text-teal-600",
    },
  ];

  return (
    <DashboardTaskCard
      title="Handlungsbedarf"
      count={total}
      isEmpty={total === 0}
      emptyMessage="Alles erledigt! 🎉"
    >
      <div className="space-y-1">
        {actionItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={item.onClick}
          >
            <div className="flex items-center gap-2">
              <item.icon className={`h-4 w-4 ${item.color}`} />
              <span className="text-sm">{item.label}</span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {item.count}
            </Badge>
          </div>
        ))}
      </div>
    </DashboardTaskCard>
  );
}
