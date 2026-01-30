import { getLegendItems } from "@/lib/scheduler-colors";
import { cn } from "@/lib/utils";

interface SchedulerLegendProps {
  className?: string;
}

export function SchedulerLegend({ className }: SchedulerLegendProps) {
  const legendItems = getLegendItems();

  return (
    <div className={cn("flex items-center gap-4 text-xs flex-wrap", className)}>
      <span className="text-muted-foreground font-medium">Legende:</span>
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded-sm", item.bg)} />
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
