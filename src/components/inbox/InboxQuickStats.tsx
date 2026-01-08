import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface InboxQuickStatsProps {
  newCount: number;
  inProgressCount: number;
  overdueCount: number;
  autoQuote: number;
  isLoading?: boolean;
}

interface StatCardProps {
  icon: React.ElementType;
  value: number | string;
  label: string;
  sublabel?: string;
  iconColor?: string;
  highlight?: boolean;
}

function StatCard({ icon: Icon, value, label, sublabel, iconColor, highlight }: StatCardProps) {
  return (
    <Card className={cn(
      "p-3 flex items-center gap-3 transition-colors",
      highlight && "bg-primary/5 border-primary/20"
    )}>
      <div className={cn(
        "h-10 w-10 rounded-full flex items-center justify-center bg-muted",
        highlight && "bg-primary/10"
      )}>
        <Icon className={cn("h-5 w-5", iconColor || "text-muted-foreground")} />
      </div>
      <div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground leading-tight">
          {label}
          {sublabel && <span className="block">{sublabel}</span>}
        </div>
      </div>
    </Card>
  );
}

export function InboxQuickStats({ 
  newCount, 
  inProgressCount, 
  overdueCount, 
  autoQuote,
  isLoading 
}: InboxQuickStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-6 w-8" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        icon={Sparkles}
        value={newCount}
        label="Neue"
        sublabel="Anfragen"
        iconColor="text-primary"
        highlight={newCount > 0}
      />
      <StatCard
        icon={Clock}
        value={inProgressCount}
        label="In Bearb."
        iconColor="text-blue-500"
      />
      <StatCard
        icon={AlertTriangle}
        value={overdueCount}
        label="Überfällig"
        sublabel="(>24h)"
        iconColor={overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}
        highlight={overdueCount > 0}
      />
      <StatCard
        icon={TrendingUp}
        value={`${autoQuote}%`}
        label="Auto-Quote"
        iconColor="text-green-500"
      />
    </div>
  );
}
