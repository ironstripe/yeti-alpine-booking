import { format, parseISO, isToday, isPast } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Check, X, Circle } from "lucide-react";
import type { GroupInstance, GroupParticipantAttendance } from "@/hooks/useGroupLeaderData";

interface AttendanceGridProps {
  instances: GroupInstance[];
  attendance: GroupParticipantAttendance[];
  onToggle: (enrollmentId: string, currentStatus: string) => void;
  disabled?: boolean;
}

export function AttendanceGrid({
  instances,
  attendance,
  onToggle,
  disabled = false,
}: AttendanceGridProps) {
  const getAttendanceForDate = (date: string) => {
    return attendance.find((a) => a.date === date);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "present":
        return <Check className="h-4 w-4" />;
      case "absent":
        return <X className="h-4 w-4" />;
      default:
        return <Circle className="h-3 w-3" />;
    }
  };

  const getStatusClass = (status: string, dateStr: string) => {
    const date = parseISO(dateStr);
    const isFuture = !isPast(date) && !isToday(date);

    if (isFuture) {
      return "bg-muted text-muted-foreground cursor-not-allowed";
    }

    switch (status) {
      case "present":
        return "bg-green-500 text-white";
      case "absent":
        return "bg-destructive text-destructive-foreground";
      default:
        return "bg-muted/50 text-muted-foreground hover:bg-muted";
    }
  };

  const handleClick = (dateStr: string) => {
    const date = parseISO(dateStr);
    const isFuture = !isPast(date) && !isToday(date);
    if (disabled || isFuture) return;

    const att = getAttendanceForDate(dateStr);
    if (!att) return;

    // Cycle through: registered -> present -> absent -> registered
    const nextStatus =
      att.status === "registered"
        ? "present"
        : att.status === "present"
        ? "absent"
        : "registered";

    onToggle(att.enrollmentId, nextStatus);
  };

  return (
    <div className="flex gap-1.5 flex-wrap">
      {instances.map((instance) => {
        const att = getAttendanceForDate(instance.date);
        const date = parseISO(instance.date);
        const isFuture = !isPast(date) && !isToday(date);
        const status = att?.status || "registered";

        return (
          <button
            key={instance.id}
            type="button"
            disabled={disabled || isFuture}
            onClick={() => handleClick(instance.date)}
            className={cn(
              "flex flex-col items-center justify-center w-11 h-14 rounded-lg transition-colors",
              getStatusClass(status, instance.date),
              !disabled && !isFuture && "cursor-pointer active:scale-95"
            )}
            title={`${format(date, "EEEE, d. MMMM", { locale: de })}: ${
              status === "present"
                ? "Anwesend"
                : status === "absent"
                ? "Abwesend"
                : "Offen"
            }`}
          >
            <span className="text-[10px] font-medium uppercase">
              {format(date, "EEE", { locale: de }).slice(0, 2)}
            </span>
            <span className="text-xs">{format(date, "d")}</span>
            <div className="mt-0.5">{getStatusIcon(status)}</div>
          </button>
        );
      })}
    </div>
  );
}
