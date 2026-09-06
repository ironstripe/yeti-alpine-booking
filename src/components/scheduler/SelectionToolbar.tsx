import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X, Clock, Ban, Building, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobileScheduler } from "@/hooks/use-touch-device";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { AbsenceTypeDialog } from "./AbsenceTypeDialog";
import { OfficeHoursDialog } from "./OfficeHoursDialog";
import type { SchedulerBooking } from "@/lib/scheduler-utils";

interface SelectionToolbarProps {
  className?: string;
  bookings?: SchedulerBooking[];
}

export function SelectionToolbar({ className, bookings = [] }: SelectionToolbarProps) {
  const navigate = useNavigate();
  const { state, clearSelection, getTotalHours } = useSchedulerSelection();
  const isMobileScheduler = useIsMobileScheduler();
  const [isAbsenceDialogOpen, setIsAbsenceDialogOpen] = useState(false);
  const [isOfficeHoursDialogOpen, setIsOfficeHoursDialogOpen] = useState(false);

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

  const handleMarkOfficeHours = () => {
    setIsOfficeHoursDialogOpen(true);
  };

  const handleAbsenceSuccess = () => {
    // Toolbar will hide automatically when selection is cleared
  };

  const handleOfficeHoursSuccess = () => {
    // Toolbar will hide automatically when selection is cleared
  };

  const summary = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="font-medium text-foreground">
        {state.selections.length} {state.selections.length === 1 ? "Slot" : "Slots"} ausgewählt
      </span>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>{totalHours}h</span>
      </div>
      {uniqueDates > 1 && (
        <span className="text-xs text-muted-foreground">({uniqueDates} Tage)</span>
      )}
    </div>
  );

  if (isMobileScheduler) {
    return (
      <>
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 w-full max-w-full",
            "border-t bg-background px-3 pt-3 shadow-lg",
            "animate-in slide-in-from-bottom-4 duration-300",
            className
          )}
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          {summary}
          <Button className="mt-3 min-h-12 w-full" onClick={handleBookSelected}>
            Buchung erstellen
          </Button>
          <div className="mt-2 flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-h-11 flex-1">
                  <MoreHorizontal className="mr-1 h-4 w-4" />
                  Mehr
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="bg-popover">
                <DropdownMenuItem onClick={handleMarkAbsence}>
                  <Ban className="mr-2 h-4 w-4" />
                  Abwesenheit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMarkOfficeHours}>
                  <Building className="mr-2 h-4 w-4" />
                  Bürodienst
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" className="min-h-11 flex-1" onClick={clearSelection}>
              <X className="mr-1 h-4 w-4" />
              Abbrechen
            </Button>
          </div>
        </div>

        <AbsenceTypeDialog
          open={isAbsenceDialogOpen}
          onOpenChange={setIsAbsenceDialogOpen}
          conflicts={getConflictingBookings()}
          onSuccess={handleAbsenceSuccess}
        />
        <OfficeHoursDialog
          open={isOfficeHoursDialogOpen}
          onOpenChange={setIsOfficeHoursDialogOpen}
          onSuccess={handleOfficeHoursSuccess}
        />
      </>
    );
  }

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
        {summary}

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
            Abbrechen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAbsence}
          >
            <Ban className="h-4 w-4 mr-1" />
            Abwesenheit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkOfficeHours}
            className="border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800"
          >
            <Building className="h-4 w-4 mr-1" />
            Bürodienst
          </Button>
          <Button size="sm" onClick={handleBookSelected}>
            Buchung erstellen
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

      {/* Office Hours Dialog */}
      <OfficeHoursDialog
        open={isOfficeHoursDialogOpen}
        onOpenChange={setIsOfficeHoursDialogOpen}
        onSuccess={handleOfficeHoursSuccess}
      />
    </>
  );
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}
