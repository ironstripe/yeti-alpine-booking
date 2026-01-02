import { useDrop } from "react-dnd";
import { cn } from "@/lib/utils";
import { BOOKING_ITEM_TYPE } from "./BookingBar";
import { Plus } from "lucide-react";
import type { SchedulerBooking } from "@/lib/scheduler-utils";

interface EmptySlotProps {
  instructorId: string;
  date: string;
  timeSlot: string;
  slotWidth: number;
  slotIndex: number;
  isBlocked: boolean;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
  onDrop: (booking: SchedulerBooking, newInstructorId: string, newTimeSlot: string) => void;
}

export function EmptySlot({
  instructorId,
  date,
  timeSlot,
  slotWidth,
  slotIndex,
  isBlocked,
  onSlotClick,
  onDrop,
}: EmptySlotProps) {
  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: BOOKING_ITEM_TYPE,
      canDrop: () => !isBlocked,
      drop: (item: { booking: SchedulerBooking }) => {
        onDrop(item.booking, instructorId, timeSlot);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [instructorId, date, timeSlot, isBlocked, onDrop]
  );

  const handleClick = () => {
    if (!isBlocked) {
      onSlotClick(instructorId, date, timeSlot);
    }
  };

  return (
    <div
      ref={drop}
      onClick={handleClick}
      className={cn(
        "absolute top-0 bottom-0 border-r border-dashed border-border/50",
        "transition-colors duration-150",
        !isBlocked && "cursor-pointer hover:bg-primary/5 group",
        isBlocked && "cursor-not-allowed bg-muted/30",
        isOver && canDrop && "bg-primary/10 ring-2 ring-primary ring-inset",
        isOver && !canDrop && "bg-destructive/10"
      )}
      style={{
        left: `${slotIndex * slotWidth}px`,
        width: `${slotWidth}px`,
      }}
    >
      {!isBlocked && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
            <Plus className="h-4 w-4 text-primary" />
          </div>
        </div>
      )}
    </div>
  );
}
