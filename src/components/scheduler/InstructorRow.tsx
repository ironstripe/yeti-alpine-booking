import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  TIME_SLOTS, 
  getInstructorColorClasses,
  isInstructorAbsent,
  type SchedulerInstructor, 
  type SchedulerBooking,
  type SchedulerAbsence 
} from "@/lib/scheduler-utils";
import { formatLanguages } from "@/lib/language-utils";
import { BookingBar } from "./BookingBar";
import { BlockingBar } from "./BlockingBar";
import { EmptySlot } from "./EmptySlot";
import { SelectionOverlay } from "./SelectionOverlay";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Languages } from "lucide-react";

interface InstructorRowProps {
  instructor: SchedulerInstructor;
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  date: string;
  slotWidth: number;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
  isHighlighted?: boolean;
}

export const InstructorRow = forwardRef<HTMLDivElement, InstructorRowProps>(
  function InstructorRow(
    {
      instructor,
      bookings,
      absences,
      date,
      slotWidth,
      onSlotClick,
      isHighlighted = false,
    },
    ref
  ) {
    const navigate = useNavigate();
    const { state } = useSchedulerSelection();
    const colorClasses = getInstructorColorClasses(instructor.color);
    const absence = isInstructorAbsent(instructor.id, date, absences);
    const instructorBookings = bookings.filter((b) => b.instructorId === instructor.id);
    
    // Get selections for this instructor on this date
    const instructorSelections = state.selections.filter(
      (s) => s.instructorId === instructor.id && s.date === date
    );

    const handleNameClick = () => {
      navigate(`/instructors/${instructor.id}`);
    };

    return (
      <div 
        ref={ref}
        className={cn(
          "flex border-b hover:bg-muted/30 transition-all duration-300",
          isHighlighted && "ring-2 ring-primary ring-inset bg-primary/5"
        )}
      >
        {/* Instructor Info Column */}
        <div className="w-48 shrink-0 border-r p-3 flex items-center gap-3">
          {/* Color Indicator */}
          <div
            className={cn(
              "w-3 h-3 rounded-full shrink-0",
              colorClasses.bg
            )}
          />
          
          {/* Name & Info with HoverCard */}
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                onClick={handleNameClick}
                className="min-w-0 text-left hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
              >
                <p className="font-medium text-sm truncate">
                  {instructor.first_name} {instructor.last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {instructor.todayBookingsCount > 0 
                    ? `${instructor.todayBookingsCount} Buchung${instructor.todayBookingsCount > 1 ? "en" : ""}`
                    : "Verfügbar"
                  }
                </p>
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-64">
              <div className="space-y-2">
                <p className="font-medium">
                  {instructor.first_name} {instructor.last_name}
                </p>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Languages className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Sprachen: {formatLanguages(instructor.languages)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Klicken für Profil öffnen
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>

        {/* Timeline Slots */}
        <div className="flex-1 relative h-16">
          {/* Empty Slot Drop Zones */}
          {TIME_SLOTS.slice(0, -1).map((time, index) => (
            <EmptySlot
              key={time}
              instructorId={instructor.id}
              date={date}
              timeSlot={time}
              slotWidth={slotWidth}
              slotIndex={index}
              isBlocked={!!absence}
              bookings={bookings}
              absences={absences}
              onSlotClick={onSlotClick}
            />
          ))}

          {/* Blocking Bar (Full Day) */}
          {absence && (
            <BlockingBar absence={absence} slotWidth={slotWidth} />
          )}

          {/* Booking Bars */}
          {!absence && instructorBookings.map((booking) => (
            <BookingBar
              key={booking.id}
              booking={booking}
              slotWidth={slotWidth}
            />
          ))}

          {/* Selection Overlays */}
          {!absence && instructorSelections.map((selection) => (
            <SelectionOverlay
              key={selection.id}
              selection={selection}
              slotWidth={slotWidth}
              bookings={bookings}
              absences={absences}
            />
          ))}
        </div>
      </div>
    );
  }
);
