import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X, Calendar, Clock } from "lucide-react";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";

interface SelectionToolbarProps {
  className?: string;
}

export function SelectionToolbar({ className }: SelectionToolbarProps) {
  const navigate = useNavigate();
  const { state, clearSelection, getTotalHours } = useSchedulerSelection();

  if (state.selections.length === 0) {
    return null;
  }

  const totalHours = getTotalHours();
  const uniqueDates = new Set(state.selections.map((s) => s.date)).size;

  const handleBookSelected = () => {
    // Encode appointments as URL parameter
    const appointments = state.selections.map((s) => ({
      date: s.date,
      startTime: s.startTime,
      durationMinutes: s.durationMinutes,
    }));

    const params = new URLSearchParams({
      instructor: state.teacherId!,
      appointments: JSON.stringify(appointments),
    });

    navigate(`/bookings/new?${params.toString()}`);
  };

  return (
    <div
      className={cn(
        "fixed bottom-20 left-1/2 -translate-x-1/2 z-50",
        "bg-background border rounded-lg shadow-lg p-3",
        "flex items-center gap-4",
        "animate-in slide-in-from-bottom-4 duration-300",
        className
      )}
    >
      {/* Selection Info */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{state.selections.length} {state.selections.length === 1 ? "Slot" : "Slots"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{totalHours}h</span>
        </div>
        {uniqueDates > 1 && (
          <span className="text-xs text-muted-foreground">
            ({uniqueDates} Tage)
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-border" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSelection}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Löschen
        </Button>
        <Button size="sm" onClick={handleBookSelected}>
          Ausgewählte buchen
        </Button>
      </div>
    </div>
  );
}
