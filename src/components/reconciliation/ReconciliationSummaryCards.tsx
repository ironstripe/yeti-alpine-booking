import { Card, CardContent } from "@/components/ui/card";
import { Banknote, CalendarCheck, Users, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DaySummary } from "@/hooks/useReconciliation";

interface ReconciliationSummaryCardsProps {
  summary: DaySummary | undefined;
  isLoading: boolean;
}

export function ReconciliationSummaryCards({ summary, isLoading }: ReconciliationSummaryCardsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(0)}h`;
  };

  const cards = [
    {
      title: "Tagesumsatz",
      value: formatCurrency(summary?.totalRevenue || 0),
      icon: Banknote,
      color: "text-emerald-600",
    },
    {
      title: "Buchungen abgeschlossen",
      value: (summary?.totalBookings || 0).toString(),
      icon: CalendarCheck,
      color: "text-primary",
    },
    {
      title: "Skilehrer im Einsatz",
      value: (summary?.totalInstructors || 0).toString(),
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Unterrichtsstunden",
      value: formatHours(summary?.totalHours || 0),
      icon: Clock,
      color: "text-amber-600",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <card.icon className={`h-5 w-5 ${card.color}`} />
              <span className="text-2xl font-bold font-display">{card.value}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{card.title}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
