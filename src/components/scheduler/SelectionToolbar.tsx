import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X, Calendar, Clock, Ban } from "lucide-react";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { AbsenceTypeDialog } from "./AbsenceTypeDialog";
import type { SchedulerBooking } from "@/lib/scheduler-utils";

interface SelectionToolbarProps {
  className?: string;
  bookings?: SchedulerBooking[];
}

export function SelectionToolbar({ className, bookings = [] }: SelectionToolbarProps) {
  const navigate = useNavigate();
  const { state, clearSelection, getTotalHours } = useSchedulerSelection();
  const [isAbsenceDialogOpen, setIsAbsenceDialogOpen] = useState(false);

  if (state.selections.length === 0) {
    return null;
  }

  const totalHours = getTotalHours();
  const uniqueDates = new Set(state.selections.map((s) => s.date)).size;

  // Check for booking conflicts with selected slots
  const getConflictingBookings = (): SchedulerBooking[] => {
    if (!state.teacherId) return [];
    
    return bookings.filter((booking) => {
      if (booking.instructorId !== state.teacherId) return false;
      
      return state.selections.some((selection) => {
        if (selection.date !== booking.date) return false;
        
        const selStart = timeToMinutes(selection.startTime);
        const selEnd = timeToMinutes(selection.endTime);
        const bookStart = timeToMinutes(booking.timeStart);
        const bookEnd = timeToMinutes(booking.timeEnd);
        
        return selStart < bookEnd && selEnd > bookStart;
      });
    });
  };

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

  const handleMarkAbsence = () => {
    setIsAbsenceDialogOpen(true);
  };

  const handleAbsenceSuccess = () => {
    // Toolbar will hide automatically when selection is cleared
  };

  return (
    <>
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAbsence}
          >
            <Ban className="h-4 w-4 mr-1" />
            Abwesenheit
          </Button>
          <Button size="sm" onClick={handleBookSelected}>
            Ausgewählte buchen
          </Button>
        </div>
      </div>

      {/* Absence Type Dialog */}
      <AbsenceTypeDialog
        open={isAbsenceDialogOpen}
        onOpenChange={setIsAbsenceDialogOpen}
        conflicts={getConflictingBookings()}
        onSuccess={handleAbsenceSuccess}
      />
    </>
  );
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}
