import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { getBookingBarClasses, calculateBarPosition, type SchedulerBooking } from "@/lib/scheduler-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BookingDetailDialog } from "./BookingDetailDialog";

interface BookingBarProps {
  booking: SchedulerBooking;
  slotWidth: number;
}

export function BookingBar({ booking, slotWidth }: BookingBarProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const isPrivate = booking.type === "private";
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `booking-${booking.id}`,
    data: {
      type: "booking",
      booking,
    },
    disabled: !isPrivate, // Only private lessons can be dragged
  });

  const { left, width } = calculateBarPosition(
    booking.timeStart,
    booking.timeEnd,
    "08:00",
    slotWidth
  );

  const barClasses = getBookingBarClasses(booking.type, booking.isPaid);

  const style = {
    left: `${left}px`,
    width: `${Math.max(width - 4, 40)}px`,
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : "transform 200ms ease",
  };

  const handleClick = (e: React.MouseEvent) => {
    // Only open detail if not dragging
    if (!isDragging) {
      e.stopPropagation();
      setIsDetailOpen(true);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={setNodeRef}
            {...(isPrivate ? { ...listeners, ...attributes } : {})}
            onClick={handleClick}
            className={cn(
              "absolute top-1 bottom-1 rounded-md border px-2 py-1 text-xs font-medium truncate",
              "flex items-center gap-1",
              barClasses,
              isPrivate && "cursor-grab active:cursor-grabbing",
              isDragging && "opacity-50 z-50 shadow-lg",
              !isPrivate && "cursor-pointer"
            )}
            style={style}
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
            <p className="text-xs text-muted-foreground italic mt-1">
              {isPrivate ? "Ziehen zum Verschieben, klicken für Details" : "Klicken für Details"}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Booking Detail Dialog */}
      <BookingDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        ticketItemId={booking.id}
      />
    </>
  );
}
