import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import type { SchedulerBooking, SchedulerAbsence } from "@/lib/scheduler-utils";

interface EmptySlotProps {
  instructorId: string;
  date: string;
  timeSlot: string;
  slotWidth: number;
  slotIndex: number;
  isBlocked: boolean;
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
}

export function EmptySlot({
  instructorId,
  date,
  timeSlot,
  slotWidth,
  slotIndex,
  isBlocked,
  bookings,
  absences,
  onSlotClick,
}: EmptySlotProps) {
  const { state, addSelection, isSlotSelected, canSelectSlot, getSelectionAt, removeSelection } = useSchedulerSelection();

  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${instructorId}-${date}-${timeSlot}`,
    data: {
      type: "slot",
      instructorId,
      date,
      timeSlot,
      isBlocked,
    },
    disabled: isBlocked,
  });

  const isSelected = isSlotSelected(instructorId, date, timeSlot);
  const selection = getSelectionAt(instructorId, date, timeSlot);
  
  // Check if this slot can be selected (for hover validation)
  const nextHourTime = `${(parseInt(timeSlot.split(":")[0]) + 1).toString().padStart(2, "0")}:00`;
  const canSelect = !isBlocked && canSelectSlot(instructorId, date, timeSlot, nextHourTime, bookings, absences);

  const handleClick = (e: React.MouseEvent) => {
    if (isBlocked || state.isResizing) return;

    // If already selected, remove selection
    if (isSelected && selection) {
      removeSelection(selection.id);
      return;
    }

    // Check if shift is held for multi-select (same time, different days)
    const isShiftHeld = e.shiftKey;

    if (isShiftHeld && state.selections.length > 0) {
      // For simple mode: same time slot, different day
      const firstSelection = state.selections[0];
      if (firstSelection.startTime === timeSlot && firstSelection.instructorId === instructorId) {
        // Add as another day with same time
        const endTime = firstSelection.endTime;
        const duration = firstSelection.durationMinutes;
        
        const validation = canSelectSlot(instructorId, date, timeSlot, endTime, bookings, absences);
        if (validation.valid) {
          addSelection({
            instructorId,
            date,
            startTime: timeSlot,
            endTime,
            durationMinutes: duration,
          });
        }
        return;
      }
    }

    // Default: Single slot selection with 60min duration
    const startHour = parseInt(timeSlot.split(":")[0]);
    const endTime = `${(startHour + 1).toString().padStart(2, "0")}:00`;
    
    const validation = canSelectSlot(instructorId, date, timeSlot, endTime, bookings, absences);
    if (validation.valid) {
      addSelection({
        instructorId,
        date,
        startTime: timeSlot,
        endTime,
        durationMinutes: 60,
      });
    }
  };

  return (
    <div
      ref={setNodeRef}
      onClick={handleClick}
      className={cn(
        "absolute top-0 bottom-0 border-r border-dashed border-border/50",
        "transition-colors duration-150",
        !isBlocked && "cursor-pointer hover:bg-primary/5 group",
        isBlocked && "cursor-not-allowed bg-muted/30",
        isOver && !isBlocked && "bg-primary/10 ring-2 ring-primary ring-inset",
        isOver && isBlocked && "bg-destructive/10",
        // Validation hover feedback
        !isBlocked && !canSelect.valid && "hover:bg-destructive/5"
      )}
      style={{
        left: `${slotIndex * slotWidth}px`,
        width: `${slotWidth}px`,
      }}
    >
      {!isBlocked && !isSelected && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center",
            canSelect.valid ? "bg-primary/20" : "bg-destructive/20"
          )}>
            <Plus className={cn(
              "h-4 w-4",
              canSelect.valid ? "text-primary" : "text-destructive"
            )} />
          </div>
        </div>
      )}
    </div>
  );
}
