import { Card, CardContent } from "@/components/ui/card";
import { Banknote, CalendarCheck, Users, Clock, ShoppingCart } from "lucide-react";
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

  const bookingRevenue = (summary?.totalRevenue || 0) - (summary?.shopRevenue || 0);
  const hasShopSales = (summary?.shopRevenue || 0) > 0;

  const cards = [
    {
      title: "Tagesumsatz",
      value: formatCurrency(summary?.totalRevenue || 0),
      subtitle: hasShopSales ? `Buchungen: ${formatCurrency(bookingRevenue)} · Shop: ${formatCurrency(summary?.shopRevenue || 0)}` : undefined,
      icon: Banknote,
      color: "text-emerald-600",
    },
    {
      title: "Buchungen",
      value: (summary?.totalBookings || 0).toString(),
      icon: CalendarCheck,
      color: "text-primary",
    },
    {
      title: "Skilehrer",
      value: (summary?.totalInstructors || 0).toString(),
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Unterricht",
      value: formatHours(summary?.totalHours || 0),
      icon: Clock,
      color: "text-amber-600",
    },
  ];

  // Add shop card if there are shop sales
  if (hasShopSales) {
    cards.splice(2, 0, {
      title: "Shop-Verkäufe",
      value: (summary?.shopSales?.length || 0).toString(),
      subtitle: formatCurrency(summary?.shopRevenue || 0),
      icon: ShoppingCart,
      color: "text-purple-600",
    });
  }

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
    <div className={`grid grid-cols-2 gap-4 ${hasShopSales ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <card.icon className={`h-5 w-5 ${card.color}`} />
              <span className="text-2xl font-bold font-display">{card.value}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{card.title}</p>
            {card.subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
