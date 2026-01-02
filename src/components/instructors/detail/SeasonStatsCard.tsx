import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Clock, CheckCircle, AlertCircle } from "lucide-react";
import type { SeasonStats } from "@/hooks/useInstructorDetail";

interface SeasonStatsCardProps {
  stats: SeasonStats | undefined;
}

export function SeasonStatsCard({ stats }: SeasonStatsCardProps) {
  const currentYear = new Date().getFullYear();
  const seasonLabel = new Date().getMonth() >= 11
    ? `${currentYear}/${currentYear + 1}`
    : `${currentYear - 1}/${currentYear}`;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const statItems = [
    {
      label: "Gebuchte Stunden",
      value: `${stats?.bookedHours || 0} h`,
      icon: Clock,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Bestätigte Stunden",
      value: `${stats?.confirmedHours || 0} h`,
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Ausstehende Bestätigung",
      value: `${stats?.pendingHours || 0} h`,
      icon: AlertCircle,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      label: "Verdienst (Brutto)",
      value: formatCurrency(stats?.grossEarnings || 0),
      icon: TrendingUp,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Saison {seasonLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {statItems.map((item) => (
            <div
              key={item.label}
              className={`p-3 rounded-lg ${item.bgColor}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <item.icon className={`h-4 w-4 ${item.color}`} />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
              <p className="text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
