import { Card, CardContent } from "@/components/ui/card";
import { Calendar, UserCheck, Inbox, Banknote, TrendingUp, TrendingDown } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function QuickStats() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useDashboardStats();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const revenueChange = stats ? ((stats.todayRevenue - stats.averageRevenue) / Math.max(stats.averageRevenue, 1)) * 100 : 0;

  const kpiCards = [
    {
      title: "Buchungen heute",
      value: stats?.todayBookings.toString() || "0",
      icon: Calendar,
      color: "text-primary",
      subtitle: null,
      onClick: () => navigate("/bookings?date=today"),
    },
    {
      title: "Lehrer verfügbar",
      value: stats?.availableInstructors.toString() || "0",
      icon: UserCheck,
      color: "text-green-600",
      subtitle: stats?.onCallInstructors ? `${stats.onCallInstructors} auf Abruf` : null,
      onClick: () => navigate("/instructors"),
    },
    {
      title: "Ungelesene",
      value: stats?.unreadMessages.toString() || "0",
      icon: Inbox,
      color: stats?.unreadMessages ? "text-orange-500" : "text-muted-foreground",
      subtitle: stats?.urgentMessages ? `${stats.urgentMessages} dringend` : null,
      onClick: () => navigate("/inbox"),
    },
    {
      title: "Umsatz heute",
      value: formatCurrency(stats?.todayRevenue || 0),
      icon: Banknote,
      color: "text-emerald-600",
      subtitle: revenueChange !== 0 ? (
        <span className={cn(
          "flex items-center gap-0.5",
          revenueChange > 0 ? "text-emerald-600" : "text-red-500"
        )}>
          {revenueChange > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {Math.abs(revenueChange).toFixed(0)}% vs. ⌀
        </span>
      ) : null,
      onClick: () => navigate("/bookings"),
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-6 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {kpiCards.map((stat) => (
        <Card 
          key={stat.title} 
          className="bg-card cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={stat.onClick}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <stat.icon className={cn("h-4 w-4", stat.color)} />
              <span className="text-xl font-bold font-display">{stat.value}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {stat.title}
            </p>
            {stat.subtitle && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {stat.subtitle}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
