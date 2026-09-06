import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { getBookingBarClasses, calculateBarPosition, OPERATIONAL_START, type SchedulerBooking, type SchedulerInstructor } from "@/lib/scheduler-utils";
import { isCrossDiscipline } from "@/lib/level-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BookingDetailDialog } from "./BookingDetailDialog";
import { OfficeHoursDetailDialog } from "./OfficeHoursDetailDialog";
import { AlertTriangle, Building, Hourglass, Link2 } from "lucide-react";
import { useIsTouchDevice, useIsMobileScheduler } from "@/hooks/use-touch-device";

const TAP_MOVE_THRESHOLD = 8; // px

interface BookingBarProps {
  booking: SchedulerBooking;
  slotWidth: number;
  instructorSpecialization?: string | null;
  isPlanningMode?: boolean;
}

export function BookingBar({ booking, slotWidth, instructorSpecialization, isPlanningMode = false }: BookingBarProps) {
  const navigate = useNavigate();
  const isTouch = useIsTouchDevice();
  const isMobileScheduler = useIsMobileScheduler();
  const dragDisabled = isTouch || isMobileScheduler;
  const swipedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isOfficeDetailOpen, setIsOfficeDetailOpen] = useState(false);
  const isPrivate = booking.type === "private";
  const isGroup = booking.type === "group";
  const isOfficeShift = booking.type === "office_shift";
  
  // Check for cross-discipline booking
  const hasCrossDiscipline = isPrivate && isCrossDiscipline(
    instructorSpecialization || null,
    booking.participantSport || null
  );
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `booking-${booking.id}`,
    data: {
      type: "booking",
      booking,
    },
    disabled: !isPrivate || dragDisabled, // Only private lessons, mouse/keyboard only, never on phones
  });

  const { left, width } = calculateBarPosition(
    booking.timeStart,
    booking.timeEnd,
    OPERATIONAL_START,
    slotWidth
  );

  const barClasses = getBookingBarClasses(booking.type as "private" | "group" | "office_shift", booking.isPaid);

  const style: React.CSSProperties = {
    left: `${left}px`,
    width: `${Math.max(width - 4, 40)}px`,
    // Only apply transform when NOT dragging - DragOverlay handles visual during drag
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
    transition: isDragging ? undefined : "transform 200ms ease",
    // Allow clicks to pass through to drop zones while dragging
    pointerEvents: isDragging ? 'none' : undefined,
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    swipedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.touches[0];
    if (
      Math.abs(t.clientX - start.x) > TAP_MOVE_THRESHOLD ||
      Math.abs(t.clientY - start.y) > TAP_MOVE_THRESHOLD
    ) {
      swipedRef.current = true; // gesture is a pan, suppress the synthetic click
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    if (!isDragging) {
      e.stopPropagation();
      
      if (isGroup) {
        // Navigate to Training Capacity page with course filter
        navigate(`/trainings/capacity?course=${booking.ticketId}`);
      } else if (isPrivate) {
        // Open detail dialog for private bookings
        setIsDetailOpen(true);
      } else if (isOfficeShift) {
        // Open detail dialog for office shifts
        setIsOfficeDetailOpen(true);
      }
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={setNodeRef}
            {...(isPrivate && !dragDisabled ? { ...listeners, ...attributes } : {})}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            className={cn(
              "absolute top-0.5 bottom-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium truncate",
              "flex items-center gap-0.5",
              barClasses,
              isPrivate && !dragDisabled && "cursor-grab active:cursor-grabbing",
              dragDisabled && "cursor-pointer touch-auto",
              isDragging && "invisible opacity-0",
              !isPrivate && "cursor-pointer",
              // Planning mode: dim existing bookings
              isPlanningMode && "opacity-50",
              // Period bookings: subtle left border indicator
              booking.isPartOfPeriod && "border-l-2 border-l-primary",
              // Provisional website reservations: amber, dashed
              booking.isProvisional && "bg-amber-400 text-amber-950 border-amber-600 border-dashed"
            )}
            style={{
              ...style,
              ...(booking.isProvisional
                ? {
                    backgroundImage:
                      "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(120, 53, 15, 0.18) 3px, rgba(120, 53, 15, 0.18) 6px)",
                  }
                : {}),
            }}
          >
            {booking.isPartOfPeriod && (
              <Link2 className="h-2.5 w-2.5 text-primary shrink-0" />
            )}
            {hasCrossDiscipline && (
              <AlertTriangle className="h-2.5 w-2.5 text-yellow-300 shrink-0" />
            )}
            {isOfficeShift && (
              <Building className="h-2.5 w-2.5 shrink-0" />
            )}
            {booking.isSharedLesson && (
              <Link2 className="h-2.5 w-2.5 text-primary shrink-0" />
            )}
            {booking.isProvisional && (
              <Hourglass className="h-2.5 w-2.5 shrink-0" />
            )}
            <span className="truncate">
              {booking.isProvisional && "Provisorisch: "}
              {booking.isSharedLesson && booking.sharedCustomerNames?.length
                ? `Privat: ${booking.sharedCustomerNames.join(" / ")}`
                : booking.participantName || (booking.type === "group" ? "Gruppe" : booking.type === "office_shift" ? "Bürodienst" : "Privat")}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            {booking.isProvisional && (
              <p className="text-sm font-medium text-amber-600 flex items-center gap-1">
                <Hourglass className="h-3 w-3" />
                Provisorisch reserviert
                {booking.source === "website" && " (Website)"}
                {booking.reservationExpiresAt &&
                  ` – gültig bis ${new Date(booking.reservationExpiresAt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`}
              </p>
            )}
            <p className="font-medium">
              {booking.type === "group" ? "Gruppenkurs" : booking.type === "office_shift" ? "Bürodienst" : "Privatstunde"}
              {booking.isPartOfPeriod && " (Periode)"}
              {booking.isSharedLesson && " (Geteilt)"}
            </p>
            {booking.isSharedLesson && booking.sharedCustomerNames && (
              <p className="text-sm flex items-center gap-1">
                <Link2 className="h-3 w-3" />
                {booking.sharedCustomerNames.join(" / ")}
              </p>
            )}
            {booking.participantName && !booking.isSharedLesson && (
              <p className="text-sm">{booking.participantName}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {booking.timeStart} - {booking.timeEnd}
            </p>
            {booking.isPartOfPeriod && (
              <p className="text-sm text-primary flex items-center gap-1">
                <Link2 className="h-3 w-3" />
                {booking.periodStartDate} – {booking.periodEndDate} ({booking.periodTotalDays} Tage)
                {booking.isOverride && " • Ausnahme"}
              </p>
            )}
            {booking.type === "group" && (
              <p className="text-sm text-muted-foreground">
                Kapazität: ({booking.currentParticipants ?? 0}/{booking.maxParticipants ?? "?"})
              </p>
            )}
            {booking.meetingPoint && (
              <p className="text-sm text-muted-foreground">
                Treffpunkt: {booking.meetingPoint}
              </p>
            )}
            {booking.type === "private" && !booking.isSharedLesson && (
              <p className="text-sm">
                Status: {booking.isPaid ? "Bezahlt ✓" : "Offen"}
              </p>
            )}
            {hasCrossDiscipline && (
              <p className="text-sm text-yellow-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Cross-Disziplin: {booking.participantSport === "snowboard" ? "Snowboard" : "Ski"}-Buchung
              </p>
            )}
            <p className="text-xs text-muted-foreground italic mt-1">
              {isPrivate 
                ? booking.isPartOfPeriod 
                  ? "Ziehen zum Verschieben (Periode), klicken für Details"
                  : "Ziehen zum Verschieben, klicken für Details" 
                : isGroup 
                  ? "Klicken für Kursdetails" 
                  : isOfficeShift
                    ? "Klicken zum Bearbeiten"
                    : "Klicken für Details"}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Booking Detail Dialog - only for private bookings */}
      {isPrivate && (
        <BookingDetailDialog
          open={isDetailOpen}
          onOpenChange={setIsDetailOpen}
          ticketItemId={booking.id}
        />
      )}

      {/* Office Hours Detail Dialog */}
      {isOfficeShift && (
        <OfficeHoursDetailDialog
          open={isOfficeDetailOpen}
          onOpenChange={setIsOfficeDetailOpen}
          block={{
            id: booking.id.replace('office-block-', ''),
            date: booking.date,
            timeStart: booking.timeStart,
            timeEnd: booking.timeEnd,
            note: booking.participantName !== "Bürodienst" ? booking.participantName : null,
          }}
        />
      )}
    </>
  );
}
