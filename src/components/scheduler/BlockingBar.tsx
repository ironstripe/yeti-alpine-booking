import { cn } from "@/lib/utils";
import { calculateBarPosition, type SchedulerAbsence } from "@/lib/scheduler-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Ban } from "lucide-react";

interface BlockingBarProps {
  absence: SchedulerAbsence;
  slotWidth: number;
}

const ABSENCE_LABELS: Record<string, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  organization: "Organisation",
  office_duty: "Bürodienst",
  other: "Abwesend",
};

export function BlockingBar({ absence, slotWidth }: BlockingBarProps) {
  // Full day blocking - spans entire timeline
  const { left, width } = calculateBarPosition(
    "08:00",
    "17:00",
    "08:00",
    slotWidth
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "absolute top-1 bottom-1 rounded-md px-2 py-1 text-xs font-medium",
            "flex items-center gap-1",
            "bg-gray-700 text-gray-200 border border-gray-600",
            "cursor-not-allowed",
            // Diagonal stripes pattern
            "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.1)_4px,rgba(0,0,0,0.1)_8px)]"
          )}
          style={{
            left: `${left}px`,
            width: `${Math.max(width - 4, 40)}px`,
          }}
        >
          <Ban className="h-3 w-3 shrink-0" />
          <span className="truncate">{ABSENCE_LABELS[absence.type]}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="space-y-1">
          <p className="font-medium">{ABSENCE_LABELS[absence.type]}</p>
          <p className="text-sm text-muted-foreground">
            {absence.startDate === absence.endDate
              ? absence.startDate
              : `${absence.startDate} - ${absence.endDate}`}
          </p>
          {absence.reason && (
            <p className="text-sm">{absence.reason}</p>
          )}
          <p className="text-xs text-destructive mt-1">
            Keine Buchungen möglich
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
