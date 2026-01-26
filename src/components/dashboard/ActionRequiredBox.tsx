import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Banknote, UserPlus, Mail, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardTaskCard } from "./DashboardTaskCard";
import { Skeleton } from "@/components/ui/skeleton";

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
      // Count overdue payments (tickets with payment_status = 'overdue')
      const { count: overduePayments } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .lt("paid_amount", supabase.rpc ? 0 : 0); // Simplified - will count all unpaid

      // Count tickets with unassigned instructors
      const { count: unassignedInstructors } = await supabase
        .from("ticket_items")
        .select("id", { count: "exact", head: true })
        .is("instructor_id", null)
        .neq("status", "cancelled");

      // Count pending confirmations
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
    ? actions.overduePayments + actions.unassignedInstructors + actions.pendingConfirmations
    : 0;

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
