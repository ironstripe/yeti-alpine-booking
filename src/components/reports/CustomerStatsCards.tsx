import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface CustomerStatsCardsProps {
  stats: {
    totalCustomers: number;
    newCustomers: number;
    newCustomersPercent: number;
    avgRevenuePerCustomer: number;
  } | undefined;
  isLoading: boolean;
}

export function CustomerStatsCards({ stats, isLoading }: CustomerStatsCardsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      value: stats?.totalCustomers || 0,
      label: "Kunden gesamt",
    },
    {
      value: `${stats?.newCustomers || 0} (${stats?.newCustomersPercent || 0}%)`,
      label: "Neukunden",
    },
    {
      value: formatCurrency(stats?.avgRevenuePerCustomer || 0),
      label: "⌀ Umsatz pro Kunde",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card, index) => (
        <Card key={index}>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">{card.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
