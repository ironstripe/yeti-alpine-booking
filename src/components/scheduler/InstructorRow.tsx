import { cn } from "@/lib/utils";
import { 
  TIME_SLOTS, 
  getInstructorColorClasses,
  isInstructorAbsent,
  type SchedulerInstructor, 
  type SchedulerBooking,
  type SchedulerAbsence 
} from "@/lib/scheduler-utils";
import { BookingBar } from "./BookingBar";
import { BlockingBar } from "./BlockingBar";
import { EmptySlot } from "./EmptySlot";

interface InstructorRowProps {
  instructor: SchedulerInstructor;
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  date: string;
  slotWidth: number;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
  onBookingDrop: (booking: SchedulerBooking, newInstructorId: string, newTimeSlot: string) => void;
}

export function InstructorRow({
  instructor,
  bookings,
  absences,
  date,
  slotWidth,
  onSlotClick,
  onBookingDrop,
}: InstructorRowProps) {
  const colorClasses = getInstructorColorClasses(instructor.color);
  const absence = isInstructorAbsent(instructor.id, date, absences);
  const instructorBookings = bookings.filter((b) => b.instructorId === instructor.id);

  return (
    <div className="flex border-b hover:bg-muted/30 transition-colors">
      {/* Instructor Info Column */}
      <div className="w-48 shrink-0 border-r p-3 flex items-center gap-3">
        {/* Color Indicator */}
        <div
          className={cn(
            "w-3 h-3 rounded-full shrink-0",
            colorClasses.bg
          )}
        />
        
        {/* Name & Info */}
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">
            {instructor.first_name} {instructor.last_name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {instructor.todayBookingsCount > 0 
              ? `${instructor.todayBookingsCount} Buchung${instructor.todayBookingsCount > 1 ? "en" : ""}`
              : "Verfügbar"
            }
          </p>
        </div>
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
            onSlotClick={onSlotClick}
            onDrop={onBookingDrop}
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
      </div>
    </div>
  );
}
