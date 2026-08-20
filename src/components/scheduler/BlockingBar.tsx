import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { calculateBarPosition, isGroupReserve, type SchedulerAbsence } from "@/lib/scheduler-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Ban, Clock, Users } from "lucide-react";
import { AbsenceDetailDialog } from "./AbsenceDetailDialog";

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
  const navigate = useNavigate();
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  // Calculate position based on full-day or partial-day absence
  const { left, width } = absence.isFullDay
    ? calculateBarPosition("09:00", "16:00", "09:00", slotWidth)
    : calculateBarPosition(
        absence.timeStart || "09:00",
        absence.timeEnd || "16:00",
        "09:00",
        slotWidth
      );

  const isPending = absence.status === "pending";
  const isReserve = isGroupReserve(absence);
  const isPartialDay = !absence.isFullDay && absence.timeStart && absence.timeEnd;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // For recurring blocks, navigate to instructor page with recurring tab focused
    if (absence.id.startsWith("recurring-")) {
      // Extract the actual block ID from the expanded absence ID (format: recurring-{blockId}-{date})
      const blockId = absence.id.split("-")[1];
      navigate(`/instructors/${absence.instructorId}?tab=recurring&blockId=${blockId}`);
    } else {
      setIsDetailOpen(true);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={handleClick}
            className={cn(
              "absolute top-0.5 bottom-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium",
              "flex items-center gap-0.5",
              "cursor-pointer hover:ring-2 hover:ring-gray-500",
              isReserve
                ? "bg-indigo-100 text-indigo-800 border-dashed border-indigo-500"
                : isPending
                  ? "bg-gray-200 text-gray-600 border-dashed border-amber-500"
                  : "bg-gray-300 text-gray-700 border-gray-400"
            )}
            style={{
              left: `${left}px`,
              width: `${Math.max(width - 4, 40)}px`,
              ...(isReserve
                ? {
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(99, 102, 241, 0.28) 3px, rgba(99, 102, 241, 0.28) 6px)",
                  }
                : isPending
                  ? {
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251, 191, 36, 0.15) 3px, rgba(251, 191, 36, 0.15) 6px)",
                    }
                  : {}),
            }}
          >
            {isReserve ? (
              <Users className="h-2.5 w-2.5 shrink-0 text-indigo-600" />
            ) : isPending ? (
              <Clock className="h-2.5 w-2.5 shrink-0 text-amber-400" />
            ) : (
              <Ban className="h-2.5 w-2.5 shrink-0" />
            )}
          <span className="truncate">
              {isReserve ? "Gruppenkurs Reserve" : ABSENCE_LABELS[absence.type]}
              {isPending && " (Antrag)"}
              {isPartialDay && ` ${absence.timeStart}-${absence.timeEnd}`}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="space-y-1">
            <p className="font-medium flex items-center gap-1">
              {isReserve ? "Gruppenkurs Reserve" : ABSENCE_LABELS[absence.type]}
              {isPending && (
                <span className="text-amber-400 text-xs">(Ausstehend)</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {absence.startDate === absence.endDate
                ? absence.startDate
                : `${absence.startDate} - ${absence.endDate}`}
              {isPartialDay && (
                <span className="ml-1">
                  ({absence.timeStart} - {absence.timeEnd})
                </span>
              )}
            </p>
            {absence.reason && (
              <p className="text-sm">{absence.reason}</p>
            )}
            <p className="text-xs text-destructive mt-1">
              {isReserve
                ? "Keine Privatstunden möglich – Gruppenkurs-Zuteilung erlaubt"
                : isPending 
                ? "Antrag wartet auf Genehmigung" 
                : isPartialDay
                  ? `Blockiert: ${absence.timeStart} - ${absence.timeEnd}`
                  : "Keine Buchungen möglich (ganztägig)"}
            </p>
            <p className="text-xs text-muted-foreground italic mt-1">
              Klicken für Abwesenheitsdetails
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
      
      <AbsenceDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        absence={absence}
      />
    </>
  );
}
