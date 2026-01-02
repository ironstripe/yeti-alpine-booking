import { useDrag } from "react-dnd";
import { cn } from "@/lib/utils";
import { getBookingBarClasses, calculateBarPosition, type SchedulerBooking } from "@/lib/scheduler-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BookingBarProps {
  booking: SchedulerBooking;
  slotWidth: number;
}

export const BOOKING_ITEM_TYPE = "booking";

export function BookingBar({ booking, slotWidth }: BookingBarProps) {
  const isPrivate = booking.type === "private";
  
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: BOOKING_ITEM_TYPE,
      item: { booking },
      canDrag: isPrivate, // Only private lessons can be dragged
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [booking, isPrivate]
  );

  const { left, width } = calculateBarPosition(
    booking.timeStart,
    booking.timeEnd,
    "08:00",
    slotWidth
  );

  const barClasses = getBookingBarClasses(booking.type, booking.isPaid);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={isPrivate ? drag : undefined}
          className={cn(
            "absolute top-1 bottom-1 rounded-md border px-2 py-1 text-xs font-medium truncate",
            "flex items-center gap-1",
            barClasses,
            isPrivate && "cursor-move",
            isDragging && "opacity-50",
            !isPrivate && "cursor-default"
          )}
          style={{
            left: `${left}px`,
            width: `${Math.max(width - 4, 40)}px`,
          }}
        >
          <span className="truncate">
            {booking.participantName || (booking.type === "group" ? "Gruppenkurs" : "Privat")}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <p className="font-medium">
            {booking.type === "group" ? "Gruppenkurs" : "Privatstunde"}
          </p>
          {booking.participantName && (
            <p className="text-sm">{booking.participantName}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {booking.timeStart} - {booking.timeEnd}
          </p>
          {booking.type === "private" && (
            <p className="text-sm">
              Status: {booking.isPaid ? "Bezahlt ✓" : "Offen"}
            </p>
          )}
          {isPrivate && (
            <p className="text-xs text-muted-foreground italic mt-1">
              Drag & Drop zum Verschieben
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
