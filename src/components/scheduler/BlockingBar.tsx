import { cn } from "@/lib/utils";
import { calculateBarPosition, type SchedulerAbsence } from "@/lib/scheduler-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Ban, Clock } from "lucide-react";

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

  const isPending = absence.status === "pending";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "absolute top-1 bottom-1 rounded-md px-2 py-1 text-xs font-medium",
            "flex items-center gap-1",
            "cursor-not-allowed",
            isPending
              ? // Pending: diagonal stripes on dark background
                "bg-gray-600 text-gray-300 border-2 border-dashed border-amber-500/50"
              : // Confirmed: solid dark
                "bg-gray-700 text-gray-200 border border-gray-600"
          )}
          style={{
            left: `${left}px`,
            width: `${Math.max(width - 4, 40)}px`,
            ...(isPending
              ? {
                  backgroundImage:
                    "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(251, 191, 36, 0.15) 4px, rgba(251, 191, 36, 0.15) 8px)",
                }
              : {}),
          }}
        >
          {isPending ? (
            <Clock className="h-3 w-3 shrink-0 text-amber-400" />
          ) : (
            <Ban className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">
            {ABSENCE_LABELS[absence.type]}
            {isPending && " (Antrag)"}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="space-y-1">
          <p className="font-medium flex items-center gap-1">
            {ABSENCE_LABELS[absence.type]}
            {isPending && (
              <span className="text-amber-400 text-xs">(Ausstehend)</span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {absence.startDate === absence.endDate
              ? absence.startDate
              : `${absence.startDate} - ${absence.endDate}`}
          </p>
          {absence.reason && (
            <p className="text-sm">{absence.reason}</p>
          )}
          <p className="text-xs text-destructive mt-1">
            {isPending 
              ? "Antrag wartet auf Genehmigung" 
              : "Keine Buchungen möglich"}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
