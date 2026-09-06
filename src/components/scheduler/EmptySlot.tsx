import { useCallback, useMemo, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Plus, Ban, Check } from "lucide-react";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { useDndKitDrag } from "@/contexts/DndKitDragContext";
import type { SchedulerBooking, SchedulerAbsence } from "@/lib/scheduler-utils";
import { toast } from "sonner";
import { useIsTouchDevice } from "@/hooks/use-touch-device";
import { useMobileSlot } from "./mobile/MobileSlotContext";
import { OPERATIONAL_END_MINUTES } from "@/lib/scheduler-utils";

const TAP_MOVE_THRESHOLD = 8; // px
const TAP_MAX_DURATION = 600; // ms

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
  isPlanningMode?: boolean;
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
  isPlanningMode = false,
}: EmptySlotProps) {
  const navigate = useNavigate();
  const isTouch = useIsTouchDevice();
  const { isMobileScheduler, onFreeSlotTap } = useMobileSlot();
  // Below 768px the desktop selection workflow is never used.
  const usesMobilePath = isMobileScheduler || isTouch;
  const tapRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const { 
    state, 
    isSlotSelected, 
    getSelectionAt, 
    removeSelection,
    startDrag,
    endDrag,
    shiftClickSelect,
    toggleSlotSelection,
    clearSelection,
    canSelectSlot,
  } = useSchedulerSelection();

  const { activeDragBookingId } = useDndKitDrag();

  // Check if slot is occupied by an existing booking (for drop zone validation)
  // Excludes the booking currently being dragged to allow moving within overlapping slots
  const isOccupied = useMemo(() => {
    const slotMin = timeToMinutes(timeSlot);
    const slotEnd = slotMin + 60; // 1-hour slot
    
    return bookings.some((b) => {
      // Skip the booking currently being dragged
      if (b.id === activeDragBookingId) return false;
      
      if (b.instructorId !== instructorId || b.date !== date) return false;
      const bookingStart = timeToMinutes(b.timeStart);
      const bookingEnd = timeToMinutes(b.timeEnd);
      return slotMin < bookingEnd && slotEnd > bookingStart;
    });
  }, [bookings, instructorId, date, timeSlot, activeDragBookingId]);

  // Slot is invalid for drop if blocked (absence) OR occupied (booking)
  const isInvalidDropZone = isBlocked || isOccupied;

  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${instructorId}-${date}-${timeSlot}`,
    data: {
      type: "slot",
      instructorId,
      date,
      timeSlot,
      isBlocked: isInvalidDropZone, // Pass combined blocked state
    },
    disabled: isInvalidDropZone, // Disable drop on occupied slots
  });

  const isSelected = isSlotSelected(instructorId, date, timeSlot);
  const selection = getSelectionAt(instructorId, date, timeSlot);
  
  // Check if this slot is within the drag preview range
  const isInDragRange = useCallback(() => {
    const { drag } = state;
    if (!drag.isDragging || drag.instructorId !== instructorId) {
      return false;
    }
    if (!drag.date || !drag.startTime || !drag.currentTime) return false;

    // Vertical multi-day range: slot date must lie between drag start and current date
    const dragDateStart = drag.currentDate && drag.currentDate < drag.date ? drag.currentDate : drag.date;
    const dragDateEnd = drag.currentDate && drag.currentDate > drag.date ? drag.currentDate : drag.date;
    if (date < dragDateStart || date > dragDateEnd) return false;
    
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

  // Calculate end time for a 1-hour slot
  const getSlotEndTime = useCallback(() => {
    const startMinutes = timeToMinutes(timeSlot);
    const endMinutes = startMinutes + 60;
    const endHour = Math.floor(endMinutes / 60);
    const endMinute = endMinutes % 60;
    return `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`;
  }, [timeSlot]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // On phones / touch devices the native scroll container owns the gesture.
    if (usesMobilePath) return;
    if (isBlocked || state.isResizing) return;
    e.preventDefault();
    e.stopPropagation(); // Prevent DndKit interference

    const endTime = getSlotEndTime();

    // Ctrl+Click (or Cmd+Click on Mac) for multi-select toggle
    if (e.ctrlKey || e.metaKey) {
      const result = toggleSlotSelection(
        {
          instructorId,
          date,
          startTime: timeSlot,
          endTime,
          durationMinutes: 60,
        },
        bookings,
        absences
      );
      
      if (result.error) {
        toast.error(result.error);
      }
      return;
    }

    // Normal click: Clear any existing multi-selection and open booking wizard
    if (state.selections.length > 0) {
      clearSelection();
    }

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

  // Double click = create booking directly with this slot prefilled
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isInvalidDropZone) return;

    const endMinutes = timeToMinutes(timeSlot) + 60;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, "0")}:${(endMinutes % 60).toString().padStart(2, "0")}`;

    const validation = canSelectSlot(instructorId, date, timeSlot, endTime, bookings, absences);
    if (!validation.valid) {
      toast.error(validation.reason || "Slot nicht verfügbar");
      return;
    }

    clearSelection();
    const params = new URLSearchParams({
      instructor: instructorId,
      appointments: JSON.stringify([
        { instructorId, date, startTime: timeSlot, durationMinutes: 60 },
      ]),
    });
    navigate(`/bookings/new?${params.toString()}`);
  };

  const handleMouseUp = () => {
    if (usesMobilePath) return;
    if (!state.drag.isDragging) return;
    endDrag(bookings, absences);
  };

  // --- Touch: distinguish tap from pan -------------------------------------
  /** End of the contiguous free window that starts at this slot. */
  const getFreeWindowEnd = useCallback(() => {
    const start = timeToMinutes(timeSlot);
    let end = OPERATIONAL_END_MINUTES;
    for (const b of bookings) {
      if (b.instructorId !== instructorId || b.date !== date) continue;
      const bStart = timeToMinutes(b.timeStart);
      if (bStart >= start && bStart < end) end = bStart;
    }
    for (const a of absences) {
      if (a.instructorId !== instructorId) continue;
      if (date < a.startDate || date > a.endDate) continue;
      if (a.isFullDay || !a.timeStart) return start;
      const aStart = timeToMinutes(a.timeStart);
      if (aStart >= start && aStart < end) end = aStart;
    }
    return end;
  }, [timeSlot, bookings, absences, instructorId, date]);

  const openBookingForSlot = useCallback(() => {
    if (isInvalidDropZone) return;

    // Mobile path: open the slot sheet, never a desktop selection.
    if (isMobileScheduler) {
      const windowEnd = getFreeWindowEnd();
      const startMin = timeToMinutes(timeSlot);
      if (windowEnd - startMin < 60) {
        toast.error("Zeitfenster zu kurz");
        return;
      }
      onFreeSlotTap({
        instructorId,
        date,
        startTime: timeSlot,
        endTime: `${Math.floor(windowEnd / 60).toString().padStart(2, "0")}:${(windowEnd % 60).toString().padStart(2, "0")}`,
      });
      return;
    }

    const endMinutes = timeToMinutes(timeSlot) + 60;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, "0")}:${(endMinutes % 60).toString().padStart(2, "0")}`;

    const validation = canSelectSlot(instructorId, date, timeSlot, endTime, bookings, absences);
    if (!validation.valid) {
      toast.error(validation.reason || "Slot nicht verfügbar");
      return;
    }

    clearSelection();
    const params = new URLSearchParams({
      instructor: instructorId,
      appointments: JSON.stringify([
        { instructorId, date, startTime: timeSlot, durationMinutes: 60 },
      ]),
    });
    navigate(`/bookings/new?${params.toString()}`);
  }, [isInvalidDropZone, timeSlot, canSelectSlot, instructorId, date, bookings, absences, clearSelection, navigate, isMobileScheduler, getFreeWindowEnd, onFreeSlotTap]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!usesMobilePath) return;
    const t = e.touches[0];
    tapRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = tapRef.current;
    if (!start) return;
    const t = e.touches[0];
    if (
      Math.abs(t.clientX - start.x) > TAP_MOVE_THRESHOLD ||
      Math.abs(t.clientY - start.y) > TAP_MOVE_THRESHOLD
    ) {
      start.moved = true; // pan wins, native scrolling continues
    }
  };

  const handleTouchEnd = () => {
    const start = tapRef.current;
    tapRef.current = null;
    if (!start || start.moved) return;
    if (Date.now() - start.t > TAP_MAX_DURATION) return;
    openBookingForSlot();
  };

  return (
    <div
      ref={setNodeRef}
      data-slot-time={timeSlot}
      data-instructor-id={instructorId}
      data-date={date}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={isMobileScheduler && !isTouch ? openBookingForSlot : undefined}
      onDoubleClick={usesMobilePath ? undefined : handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { tapRef.current = null; }}
      className={cn(
        "absolute top-0 bottom-0 border-r border-border",
        "transition-colors duration-100 select-none",
        // Touch devices: let the scroll container own the gesture
        usesMobilePath ? "touch-auto" : "touch-none",
        !isInvalidDropZone && !state.drag.isDragging && "cursor-pointer hover:bg-accent hover:border-border group",
        state.drag.isDragging && "cursor-crosshair",
        isInvalidDropZone && "cursor-not-allowed",
        isBlocked && "bg-muted/30", // Only show muted background for absences
        // Multi-select visual feedback: blue border + highlight
        isSelected && "border-[3px] border-primary bg-primary/10 z-10",
        // DnD drop zone feedback - subtle for valid, red for invalid
        !isInvalidDropZone && activeDragBookingId && "transition-all duration-150",
        isOver && !isInvalidDropZone && "bg-primary/10 ring-2 ring-primary/40 ring-inset",
        isOver && isInvalidDropZone && "bg-destructive/10 ring-2 ring-destructive/40 ring-inset cursor-not-allowed",
        // Drag selection preview styling
        isDragPreview && !isDragBlocked && "bg-primary/15 border-l-2 border-l-primary",
        isDragPreview && isDragBlocked && "bg-destructive/15",
        // Planning mode: enhanced hover for available slots
        isPlanningMode && !isInvalidDropZone && !isDragPreview && !isSelected && "hover:bg-accent hover:ring-2 hover:ring-primary/30 hover:ring-inset"
      )}
      style={{
        left: `${slotIndex * slotWidth}px`,
        width: `${slotWidth}px`,
      }}
    >
      {/* Checkmark indicator for multi-selected slots */}
      {isSelected && (
        <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center z-20">
          <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
        </div>
      )}

      {/* Hover indicator for empty non-dragging slots */}
      {!isInvalidDropZone && !isSelected && !isDragPreview && !state.drag.isDragging && (
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