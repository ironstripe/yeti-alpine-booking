import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown } from "lucide-react";
import { QuickStats } from "@/hooks/useReportsData";

interface ReportQuickStatsProps {
  stats: QuickStats | undefined;
  isLoading: boolean;
}

export function ReportQuickStats({ stats, isLoading }: ReportQuickStatsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("de-CH").format(value);
  };

  const TrendBadge = ({ value }: { value: number }) => (
    <div className={`flex items-center gap-1 text-xs ${value >= 0 ? "text-green-600" : "text-red-600"}`}>
      {value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      <span>{value >= 0 ? "+" : ""}{value}% vs. Vorsaison</span>
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      icon: "💰",
      value: formatCurrency(stats?.totalRevenue || 0),
      label: "Gesamtumsatz",
      trend: stats?.revenueTrend || 0,
    },
    {
      icon: "📋",
      value: formatNumber(stats?.totalBookings || 0),
      label: "Buchungen",
      trend: stats?.bookingsTrend || 0,
    },
    {
      icon: "👥",
      value: formatNumber(stats?.totalParticipants || 0),
      label: "Teilnehmer",
      trend: stats?.participantsTrend || 0,
    },
    {
      icon: "⏱️",
      value: `${formatNumber(stats?.totalHours || 0)}h`,
      label: "Unterrichtsstunden",
      trend: stats?.hoursTrend || 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {statCards.map((stat, index) => (
        <Card key={index}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <div className="mt-2">
              <TrendBadge value={stat.trend} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
