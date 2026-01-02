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
    endDrag,
    shiftClickSelect,
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
    e.stopPropagation(); // Prevent DndKit interference

    // If clicking on existing selection, toggle it off
    if (isSelected && selection) {
      removeSelection(selection.id);
      return;
    }

    // Check if this teacher is valid (same as existing or none selected)
    if (state.teacherId && state.teacherId !== instructorId) {
      return;
    }

    // Shift+click for multi-day selection
    if (e.shiftKey && state.anchorSlot) {
      // Calculate end time (1 hour from start by default)
      const startMinutes = timeToMinutes(timeSlot);
      const endMinutes = startMinutes + 60;
      const endHour = Math.floor(endMinutes / 60);
      const endMinute = endMinutes % 60;
      const endTime = `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`;
      
      shiftClickSelect(
        instructorId,
        date,
        timeSlot,
        endTime,
        60,
        bookings,
        absences
      );
      return;
    }

    // Start drag selection
    startDrag(instructorId, date, timeSlot);
  };

  const handleMouseUp = () => {
    if (!state.drag.isDragging) return;
    endDrag(bookings, absences);
  };

  return (
    <div
      ref={setNodeRef}
      data-slot-time={timeSlot}
      data-instructor-id={instructorId}
      data-date={date}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      className={cn(
        "absolute top-0 bottom-0 border-r border-slate-300",
        "transition-colors duration-100 select-none touch-none",
        !isBlocked && !state.drag.isDragging && "cursor-pointer hover:bg-slate-100 hover:border-slate-400 group",
        state.drag.isDragging && "cursor-crosshair",
        isBlocked && "cursor-not-allowed bg-muted/30",
        isOver && !isBlocked && "bg-blue-100 ring-2 ring-blue-500 ring-inset",
        isOver && isBlocked && "bg-destructive/10",
        // Drag preview styling - strong blue
        isDragPreview && !isDragBlocked && "bg-[rgba(59,130,246,0.15)] border-l-2 border-l-blue-500",
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
          <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
            <Plus className="h-3 w-3 text-blue-600" />
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