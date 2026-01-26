import { Card, CardContent } from "@/components/ui/card";
import { Calendar, UserCheck, Inbox } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  subtitle?: string | null;
  color: string;
  onClick: () => void;
}

function KpiCard({ icon: Icon, title, value, subtitle, color, onClick }: KpiCardProps) {
  return (
    <Card 
      className="bg-card cursor-pointer hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", color)} />
          <span className="text-xl font-bold font-display">{value}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {title}
        </p>
        {subtitle && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function KpiCards() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useDashboardStats();

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
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
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
    <div className="grid grid-cols-3 gap-2">
      {kpiCards.map((stat) => (
        <KpiCard
          key={stat.title}
          icon={stat.icon}
          title={stat.title}
          value={stat.value}
          subtitle={stat.subtitle}
          color={stat.color}
          onClick={stat.onClick}
        />
      ))}
    </div>
  );
}
