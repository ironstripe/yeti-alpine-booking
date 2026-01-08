import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, Wallet, Clock, TrendingUp } from "lucide-react";
import type { VoucherStats } from "@/hooks/useVouchers";

interface VoucherKPICardsProps {
  stats: VoucherStats | undefined;
  isLoading: boolean;
}

export function VoucherKPICards({ stats, isLoading }: VoucherKPICardsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const cards = [
    {
      title: "Aktive Gutscheine",
      value: stats?.activeCount?.toString() || "0",
      icon: Gift,
      color: "text-emerald-600",
    },
    {
      title: "Offener Gesamtwert",
      value: formatCurrency(stats?.totalOpenValue || 0),
      icon: Wallet,
      color: "text-primary",
    },
    {
      title: "Bald ablaufend",
      value: stats?.expiringCount?.toString() || "0",
      icon: Clock,
      color: "text-amber-600",
    },
    {
      title: "Eingelöst diese Saison",
      value: formatCurrency(stats?.redeemedThisSeason || 0),
      icon: TrendingUp,
      color: "text-blue-600",
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
