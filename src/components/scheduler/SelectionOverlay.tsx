import { useRef, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { X, GripVertical } from "lucide-react";
import { useSchedulerSelection, type SlotSelection } from "@/contexts/SchedulerSelectionContext";
import { calculateBarPosition, OPERATIONAL_START, type SchedulerBooking, type SchedulerAbsence } from "@/lib/scheduler-utils";

interface SelectionOverlayProps {
  selection: SlotSelection;
  slotWidth: number;
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export function SelectionOverlay({ selection, slotWidth, bookings, absences }: SelectionOverlayProps) {
  const { removeSelection, updateSelectionDuration, setIsResizing, canSelectSlot } = useSchedulerSelection();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setLocalIsResizing] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const { left, width } = calculateBarPosition(
    selection.startTime,
    selection.endTime,
    OPERATIONAL_START,
    slotWidth
  );

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeSelection(selection.id);
  };

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      
      setLocalIsResizing(true);
      setIsResizing(true, selection.id);

      const startX = e.clientX;
      const startWidth = width;
      const minWidth = slotWidth; // 1 hour minimum
      const maxWidth = slotWidth * 4; // 4 hours maximum

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        let newWidth = startWidth + deltaX;
        
        // Snap to 30-minute increments
        const snapWidth = slotWidth / 2;
        newWidth = Math.round(newWidth / snapWidth) * snapWidth;
        
        // Clamp to min/max
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        
        // Calculate new end time
        const startMinutes = timeToMinutes(selection.startTime);
        const newDurationMinutes = (newWidth / slotWidth) * 60;
        const newEndMinutes = startMinutes + newDurationMinutes;
        const newEndTime = minutesToTime(newEndMinutes);
        
        // Validate the new selection
        const validation = canSelectSlot(
          selection.instructorId,
          selection.date,
          selection.startTime,
          newEndTime,
          bookings,
          absences
        );
        
        if (validation.valid) {
          setPreviewWidth(newWidth);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        
        setLocalIsResizing(false);
        setIsResizing(false);
        
        if (previewWidth) {
          const startMinutes = timeToMinutes(selection.startTime);
          const newDurationMinutes = (previewWidth / slotWidth) * 60;
          const newEndMinutes = startMinutes + newDurationMinutes;
          const newEndTime = minutesToTime(newEndMinutes);
          
          updateSelectionDuration(selection.id, newEndTime, newDurationMinutes);
        }
        
        setPreviewWidth(null);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [selection, slotWidth, width, bookings, absences, canSelectSlot, setIsResizing, updateSelectionDuration, previewWidth]
  );

  const displayWidth = previewWidth || width;
  const durationHours = selection.durationMinutes / 60;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "absolute top-1 bottom-1 rounded-md group",
        "bg-[rgba(59,130,246,0.15)] border-2 border-blue-500",
        "flex items-center px-2",
        "transition-all duration-100",
        isResizing && "ring-2 ring-blue-400/50"
      )}
      style={{
        left: `${left}px`,
        width: `${Math.max(displayWidth - 4, 40)}px`,
      }}
    >
      {/* Time Label */}
      <span className="text-xs font-medium text-blue-700 truncate flex-1">
        {selection.startTime} - {selection.endTime}
        {displayWidth > 80 && (
          <span className="text-blue-600/70 ml-1">({durationHours}h)</span>
        )}
      </span>

      {/* Remove Button - Only visible on hover */}
      <button
        onClick={handleRemove}
        className={cn(
          "w-5 h-5 rounded-full bg-destructive/20 hover:bg-destructive/40",
          "flex items-center justify-center transition-all",
          "absolute -top-2 -right-2",
          isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75"
        )}
      >
        <X className="h-3 w-3 text-destructive" />
      </button>

      {/* Resize Handle */}
      <div
        onMouseDown={handleResizeStart}
        className={cn(
          "w-4 h-full absolute right-0 top-0 bottom-0 cursor-ew-resize",
          "flex items-center justify-center",
          "hover:bg-blue-500/30 transition-colors rounded-r-md",
          isHovered ? "opacity-100" : "opacity-0"
        )}
      >
        <GripVertical className="h-4 w-4 text-blue-600/60" />
      </div>
    </div>
  );
}