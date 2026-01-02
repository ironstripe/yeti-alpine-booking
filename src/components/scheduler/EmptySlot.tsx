import { useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Plus, Ban } from "lucide-react";
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
  onSlotClick?: (instructorId: string, date: string, timeSlot: string) => void;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
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
}: EmptySlotProps) {
  const { 
    state, 
    isSlotSelected, 
    getSelectionAt, 
    removeSelection,
    startDrag,
    updateDrag,
    endDrag,
  } = useSchedulerSelection();

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
  
  // Check if this slot is within the drag preview range
  const isInDragRange = useCallback(() => {
    const { drag } = state;
    if (!drag.isDragging || drag.instructorId !== instructorId || drag.date !== date) {
      return false;
    }
    if (!drag.startTime || !drag.currentTime) return false;
    
    const startMin = timeToMinutes(drag.startTime);
    const currentMin = timeToMinutes(drag.currentTime);
    const slotMin = timeToMinutes(timeSlot);
    
    const rangeStart = Math.min(startMin, currentMin);
    const rangeEnd = Math.max(startMin, currentMin);
    
    return slotMin >= rangeStart && slotMin <= rangeEnd;
  }, [state.drag, instructorId, date, timeSlot]);

  const isDragPreview = isInDragRange();
  const isDragBlocked = isDragPreview && state.drag.isBlocked;

  // Check for conflicts at this slot
  const hasConflict = useCallback(() => {
    const slotMin = timeToMinutes(timeSlot);
    const slotEnd = slotMin + 60;
    
    // Check bookings
    const hasBookingConflict = bookings.some((b) => {
      if (b.instructorId !== instructorId || b.date !== date) return false;
      const bookingStart = timeToMinutes(b.timeStart);
      const bookingEnd = timeToMinutes(b.timeEnd);
      return slotMin < bookingEnd && slotEnd > bookingStart;
    });
    
    if (hasBookingConflict) return true;
    
    // Check absences
    const hasAbsenceConflict = absences.some(
      (a) => a.instructorId === instructorId && date >= a.startDate && date <= a.endDate
    );
    
    return hasAbsenceConflict;
  }, [instructorId, date, timeSlot, bookings, absences]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isBlocked || state.isResizing) return;
    e.preventDefault();

    // If clicking on existing selection, toggle it off
    if (isSelected && selection) {
      removeSelection(selection.id);
      return;
    }

    // Check if this teacher is valid (same as existing or none selected)
    if (state.teacherId && state.teacherId !== instructorId) {
      return;
    }

    // Start drag selection
    startDrag(instructorId, date, timeSlot);
  };

  const handleMouseEnter = () => {
    if (!state.drag.isDragging) return;
    if (state.drag.instructorId !== instructorId || state.drag.date !== date) return;
    
    // Check if this slot would cause a conflict
    const conflicted = hasConflict();
    updateDrag(timeSlot, conflicted);
  };

  const handleMouseUp = () => {
    if (!state.drag.isDragging) return;
    endDrag(bookings, absences);
  };

  return (
    <div
      ref={setNodeRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseUp={handleMouseUp}
      className={cn(
        "absolute top-0 bottom-0 border-r border-dashed border-border/50",
        "transition-colors duration-100 select-none",
        !isBlocked && !state.drag.isDragging && "cursor-pointer hover:bg-primary/5 group",
        state.drag.isDragging && "cursor-crosshair",
        isBlocked && "cursor-not-allowed bg-muted/30",
        isOver && !isBlocked && "bg-primary/10 ring-2 ring-primary ring-inset",
        isOver && isBlocked && "bg-destructive/10",
        // Drag preview styling
        isDragPreview && !isDragBlocked && "bg-primary/15",
        isDragPreview && isDragBlocked && "bg-destructive/15"
      )}
      style={{
        left: `${slotIndex * slotWidth}px`,
        width: `${slotWidth}px`,
      }}
    >
      {/* Hover indicator for empty non-dragging slots */}
      {!isBlocked && !isSelected && !isDragPreview && !state.drag.isDragging && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
            <Plus className="h-3 w-3 text-primary" />
          </div>
        </div>
      )}

      {/* Blocked indicator during drag */}
      {isDragPreview && isDragBlocked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Ban className="h-4 w-4 text-destructive/60" />
        </div>
      )}
    </div>
  );
}