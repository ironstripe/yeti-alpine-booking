import { getLegendItems } from "@/lib/scheduler-colors";
import { getBookingBarClasses } from "@/lib/scheduler-utils";
import { cn } from "@/lib/utils";
import { Building, Users } from "lucide-react";

interface SchedulerLegendProps {
  className?: string;
  compact?: boolean;
}

export function SchedulerLegend({ className, compact = false }: SchedulerLegendProps) {
  const legendItems = getLegendItems();

  if (compact) {
    return (
      <div className={cn("border-t border-border px-3 py-2 flex flex-wrap gap-3 text-[10px]", className)}>
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-sm border", getBookingBarClasses("private", true))} />
          <span>Bezahlt</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-sm border", getBookingBarClasses("private", false))} />
          <span>Offen</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-sm border", getBookingBarClasses("group", false))} />
          <Users className="h-3 w-3" aria-hidden="true" />
          <span>Gruppe</span>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-sm border", getBookingBarClasses("office_shift", false))} />
          <Building className="h-3 w-3" aria-hidden="true" />
          <span>Büro</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-gray-300" />
          <span>Abwesend</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-primary/20 border-l-2 border-l-primary" />
          <span>Periode</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-blue-500/20 border border-blue-500" />
          <span>Auswahl</span>
        </div>
        <div className="ml-auto text-muted-foreground">09:00–16:00</div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-4 text-xs flex-wrap", className)}>
      <span className="text-muted-foreground font-medium">Legende:</span>
      {legendItems.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded-sm", item.bg, item.text)} />
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
