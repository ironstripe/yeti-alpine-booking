import { forwardRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { 
  BOOKABLE_HOURS,
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
  collapseEmpty?: boolean;
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
      collapseEmpty = false,
    },
    ref
  ) {
    const dateStr = format(date, "yyyy-MM-dd");

    // Filter bookings and absences for this specific day
    const dayBookings = bookings.filter(b => b.date === dateStr);
    const dayAbsences = absences.filter(a => dateStr >= a.startDate && dateStr <= a.endDate);

    // Check if instructor has activity on this day
    const hasActivity = (instructorId: string) => {
      const hasBookings = dayBookings.some(b => b.instructorId === instructorId);
      const hasAbsences = dayAbsences.some(a => a.instructorId === instructorId);
      return hasBookings || hasAbsences;
    };

    return (
      <div 
        ref={ref}
        className={cn(
          "day-section",
          !isFirstDay && "border-t-2 border-slate-300"
        )}
      >
        {/* Slim Day Header - 24px */}
        <div className="sticky left-0 bg-slate-100 px-3 py-1 font-semibold text-xs border-b border-slate-300 flex items-center justify-between">
          <span>{format(date, "EEE, dd.MM.", { locale: de })}</span>
          <span className="text-muted-foreground font-normal">
            {dayBookings.length} Buchung{dayBookings.length !== 1 ? "en" : ""}
          </span>
        </div>

        {/* Instructor Rows for this day */}
        {instructors.map((instructor, index) => {
          const instructorHasActivity = hasActivity(instructor.id);
          
          // Collapsed empty row (24px)
          if (collapseEmpty && !instructorHasActivity) {
            const isEvenRow = index % 2 === 0;
            return (
              <div 
                key={`${instructor.id}-${dateStr}`}
                ref={(el) => {
                  if (instructorRefs) {
                    const key = `${instructor.id}-${dateStr}`;
                    if (el) {
                      instructorRefs.current.set(key, el);
                    } else {
                      instructorRefs.current.delete(key);
                    }
                  }
                }}
                className={cn(
                  "flex h-6 border-b border-slate-300 opacity-40 hover:opacity-70 transition-opacity",
                  isEvenRow && "bg-slate-50"
                )}
              >
                <div className={cn(
                  "w-40 shrink-0 border-r border-slate-300 px-2 py-0.5 text-xs truncate flex items-center sticky left-0 z-10",
                  isEvenRow ? "bg-slate-50" : "bg-background"
                )}>
                  {instructor.first_name} {instructor.last_name.charAt(0)}.
                </div>
                <div 
                  className="flex-1" 
                  style={{ width: `${BOOKABLE_HOURS * slotWidth}px` }}
                />
              </div>
            );
          }

          return (
            <SingleDayInstructorRow
              key={`${instructor.id}-${dateStr}`}
              ref={(el) => {
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
              rowIndex={index}
            />
          );
        })}
      </div>
    );
  }
);
