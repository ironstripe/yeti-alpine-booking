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
            "absolute top-0.5 bottom-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium",
            "flex items-center gap-0.5",
            "cursor-not-allowed",
            isPending
              ? "bg-gray-600 text-gray-300 border-dashed border-amber-500/50"
              : "bg-gray-700 text-gray-200 border-gray-600"
          )}
          style={{
            left: `${left}px`,
            width: `${Math.max(width - 4, 40)}px`,
            ...(isPending
              ? {
                  backgroundImage:
                    "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251, 191, 36, 0.15) 3px, rgba(251, 191, 36, 0.15) 6px)",
                }
              : {}),
          }}
        >
          {isPending ? (
            <Clock className="h-2.5 w-2.5 shrink-0 text-amber-400" />
          ) : (
            <Ban className="h-2.5 w-2.5 shrink-0" />
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
