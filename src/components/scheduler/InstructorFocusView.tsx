import { useRef, useMemo } from "react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { InstructorWeekBlock } from "./InstructorWeekBlock";
import { SingleDayInstructorRow } from "./SingleDayInstructorRow";
import type { SchedulerInstructor, SchedulerBooking, SchedulerAbsence } from "@/lib/scheduler-utils";

interface InstructorFocusViewProps {
  instructors: SchedulerInstructor[];
  dates: Date[];
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  slotWidth: number;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
  isLoading: boolean;
  highlightedInstructorId: string | null;
  capabilityFilter: string | null;
  compactMode: boolean;
  instructorRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

export function InstructorFocusView({
  instructors,
  dates,
  bookings,
  absences,
  slotWidth,
  onSlotClick,
  isLoading,
  highlightedInstructorId,
  capabilityFilter,
  compactMode,
  instructorRefs,
}: InstructorFocusViewProps) {
  // Filter instructors in compact mode
  const filteredInstructors = useMemo(() => {
    if (!compactMode) return instructors;
    
    return instructors.filter(instructor => {
      const hasBookings = bookings.some(b => b.instructorId === instructor.id);
      const hasAbsences = absences.some(a => a.instructorId === instructor.id);
      return hasBookings || hasAbsences;
    });
  }, [instructors, bookings, absences, compactMode]);

  if (isLoading) {
    return (
      <div className="space-y-0">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b-2 border-slate-300">
            <div className="flex border-b border-slate-300">
              <div className="w-28 shrink-0 border-r border-slate-300 px-2 py-2">
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="w-14 shrink-0 border-r border-slate-300" />
              <div className="flex-1" />
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex border-b border-slate-200 last:border-b-0">
                <div className="w-28 shrink-0 border-r border-slate-300" />
                <div className="w-14 shrink-0 border-r border-slate-200 px-1.5 py-0.5">
                  <Skeleton className="h-3 w-8" />
                </div>
                <div className="flex-1 p-1">
                  <Skeleton className="h-6 w-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (instructors.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        Keine aktiven Lehrer gefunden
      </div>
    );
  }

  if (compactMode && filteredInstructors.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        Keine Lehrer mit Buchungen im gewählten Zeitraum
      </div>
    );
  }

  const isSingleDay = dates.length === 1;

  return (
    <div className="min-w-max">
      {/* Compact Mode Info Bar */}
      {compactMode && filteredInstructors.length < instructors.length && (
        <div className="bg-muted/40 border-b border-slate-300 px-3 py-1 text-[10px] text-muted-foreground sticky top-[34px] z-20">
          Kompakt: {filteredInstructors.length}/{instructors.length} Lehrer mit Aktivität
        </div>
      )}

      {/* Single Day View - Use simpler rows */}
      {isSingleDay && filteredInstructors.map((instructor, index) => (
        <SingleDayInstructorRow
          key={instructor.id}
          ref={(el) => {
            if (el) {
              instructorRefs.current.set(instructor.id, el);
            } else {
              instructorRefs.current.delete(instructor.id);
            }
          }}
          instructor={instructor}
          date={dates[0]}
          bookings={bookings}
          absences={absences}
          slotWidth={slotWidth}
          onSlotClick={onSlotClick}
          isHighlighted={highlightedInstructorId === instructor.id}
          capabilityFilter={capabilityFilter}
          rowIndex={index}
        />
      ))}

      {/* Multi-Day View - Use week blocks with day sub-rows */}
      {!isSingleDay && filteredInstructors.map((instructor, index) => (
        <InstructorWeekBlock
          key={instructor.id}
          ref={(el) => {
            if (el) {
              instructorRefs.current.set(instructor.id, el);
            } else {
              instructorRefs.current.delete(instructor.id);
            }
          }}
          instructor={instructor}
          dates={dates}
          bookings={bookings}
          absences={absences}
          slotWidth={slotWidth}
          onSlotClick={onSlotClick}
          isHighlighted={highlightedInstructorId === instructor.id}
          capabilityFilter={capabilityFilter}
          rowIndex={index}
        />
      ))}
    </div>
  );
}
