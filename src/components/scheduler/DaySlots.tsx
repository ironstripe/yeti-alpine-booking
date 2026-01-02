import { TIME_SLOTS } from "@/lib/scheduler-utils";
import type { SchedulerInstructor, SchedulerBooking, SchedulerAbsence } from "@/lib/scheduler-utils";
import { BookingBar } from "./BookingBar";
import { BlockingBar } from "./BlockingBar";
import { EmptySlot } from "./EmptySlot";
import { SelectionOverlay } from "./SelectionOverlay";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { isInstructorAbsent } from "@/lib/scheduler-utils";

interface DaySlotsProps {
  instructor: SchedulerInstructor;
  date: string;
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  slotWidth: number;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
}

export function DaySlots({
  instructor,
  date,
  bookings,
  absences,
  slotWidth,
  onSlotClick,
}: DaySlotsProps) {
  const { state } = useSchedulerSelection();
  
  const absence = isInstructorAbsent(instructor.id, date, absences);
  const instructorBookings = bookings.filter(
    (b) => b.instructorId === instructor.id && b.date === date
  );
  
  // Get selections for this instructor on this date
  const instructorSelections = state.selections.filter(
    (s) => s.instructorId === instructor.id && s.date === date
  );

  return (
    <>
      {/* Empty Slot Drop Zones */}
      {TIME_SLOTS.slice(0, -1).map((time, index) => (
        <EmptySlot
          key={`${date}-${time}`}
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
          instructorSpecialization={instructor.specialization}
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
    </>
  );
}
