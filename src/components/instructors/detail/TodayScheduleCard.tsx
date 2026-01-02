import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Check, Clock } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { TodayBooking } from "@/hooks/useInstructorDetail";

interface TodayScheduleCardProps {
  bookings: TodayBooking[];
}

const timeSlots = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"
];

export function TodayScheduleCard({ bookings }: TodayScheduleCardProps) {
  const today = format(new Date(), "EEEE, d. MMMM", { locale: de });

  const getBookingForSlot = (slot: string) => {
    const slotHour = parseInt(slot.split(":")[0]);
    return bookings.find((b) => {
      if (!b.time_start) return false;
      const startHour = parseInt(b.time_start.split(":")[0]);
      const endHour = b.time_end ? parseInt(b.time_end.split(":")[0]) : startHour + 1;
      return slotHour >= startHour && slotHour < endHour;
    });
  };

  const isSlotStart = (slot: string, booking: TodayBooking) => {
    if (!booking.time_start) return false;
    return slot === booking.time_start.slice(0, 5);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-lg">Heute</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground capitalize">{today}</p>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Keine Buchungen für heute</p>
          </div>
        ) : (
          <div className="space-y-1">
            {timeSlots.map((slot) => {
              const booking = getBookingForSlot(slot);
              const isStart = booking && isSlotStart(slot, booking);

              if (booking) {
                return (
                  <div key={slot} className="flex gap-2">
                    <span className="text-xs text-muted-foreground w-12 pt-1">{slot}</span>
                    <div
                      className={`flex-1 bg-primary/10 border-l-4 border-primary px-3 py-1.5 ${
                        isStart ? "rounded-t-md" : ""
                      }`}
                    >
                      {isStart && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Badge
                              variant="secondary"
                              className="text-xs"
                            >
                              {booking.product_type === "private" ? "Privat" : "Gruppe"}
                            </Badge>
                            {booking.instructor_confirmation === "confirmed" && (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            )}
                          </div>
                          <p className="text-sm font-medium">
                            {booking.participant_name || booking.product_name || "Buchung"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {booking.time_start?.slice(0, 5)} - {booking.time_end?.slice(0, 5)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={slot} className="flex gap-2">
                  <span className="text-xs text-muted-foreground w-12">{slot}</span>
                  <div className="flex-1 border-l-2 border-dashed border-muted-foreground/20 h-8" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
