import { forwardRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  type SchedulerInstructor, 
  type SchedulerBooking,
  type SchedulerAbsence 
} from "@/lib/scheduler-utils";
import { SingleDayInstructorRow } from "./SingleDayInstructorRow";

interface DaySectionProps {
  date: Date;
  instructors: SchedulerInstructor[];
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  slotWidth: number;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
  isFirstDay?: boolean;
  highlightedInstructorId?: string | null;
  capabilityFilter?: string | null;
  instructorRefs?: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

export const DaySection = forwardRef<HTMLDivElement, DaySectionProps>(
  function DaySection(
    {
      date,
      instructors,
      bookings,
      absences,
      slotWidth,
      onSlotClick,
      isFirstDay = false,
      highlightedInstructorId = null,
      capabilityFilter = null,
      instructorRefs,
    },
    ref
  ) {
    const dateStr = format(date, "yyyy-MM-dd");

    // Filter bookings and absences for this specific day
    const dayBookings = bookings.filter(b => b.date === dateStr);
    const dayAbsences = absences.filter(a => dateStr >= a.startDate && dateStr <= a.endDate);

    return (
      <div 
        ref={ref}
        className={cn(
          "day-section",
          !isFirstDay && "mt-4 pt-2 border-t-4 border-primary/20"
        )}
      >
        {/* Day Header - Full Width with distinct background */}
        <div className="sticky left-0 bg-primary/10 px-4 py-3 font-bold text-base border-b-2 border-primary/30 flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-primary" />
          <span>{format(date, "EEEE, dd. MMMM yyyy", { locale: de })}</span>
          <span className="text-sm font-normal text-muted-foreground ml-auto">
            {dayBookings.length} Buchung{dayBookings.length !== 1 ? "en" : ""}
          </span>
        </div>

        {/* Instructor Rows for this day */}
        {instructors.map((instructor) => (
          <SingleDayInstructorRow
            key={`${instructor.id}-${dateStr}`}
            ref={(el) => {
              // Store ref with a combined key for this day's instructor row
              if (instructorRefs) {
                const key = `${instructor.id}-${dateStr}`;
                if (el) {
                  instructorRefs.current.set(key, el);
                } else {
                  instructorRefs.current.delete(key);
                }
              }
            }}
            instructor={instructor}
            date={date}
            bookings={bookings}
            absences={absences}
            slotWidth={slotWidth}
            onSlotClick={onSlotClick}
            isHighlighted={highlightedInstructorId === instructor.id}
            capabilityFilter={capabilityFilter}
          />
        ))}
      </div>
    );
  }
);
