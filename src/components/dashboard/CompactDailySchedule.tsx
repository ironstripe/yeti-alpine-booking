import { useMemo } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ExternalLink, Loader2, Clock, User } from "lucide-react";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { generateDateRange, SchedulerBooking } from "@/lib/scheduler-utils";

export function CompactDailySchedule() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);

  const visibleDates = useMemo(() => generateDateRange(today, 1), [today]);

  const startDate = visibleDates[0];
  const endDate = visibleDates[visibleDates.length - 1];

  const { instructors, bookings, absences, isLoading, error } = useSchedulerData({
    startDate,
    endDate,
  });

  // Group bookings by instructor
  const instructorBookings = useMemo(() => {
    const grouped = new Map<
      string,
      {
        instructor: (typeof instructors)[0];
        bookings: SchedulerBooking[];
        isAbsent: boolean;
      }
    >();

    instructors.forEach((instructor) => {
      const instructorBookingsToday = bookings.filter(
        (b) => b.instructorId === instructor.id
      );
      const isAbsent = absences.some(
        (a) =>
          a.instructorId === instructor.id &&
          a.status === "confirmed" &&
          new Date(a.startDate) <= today &&
          new Date(a.endDate) >= today
      );

      if (instructorBookingsToday.length > 0 || isAbsent) {
        grouped.set(instructor.id, {
          instructor,
          bookings: instructorBookingsToday,
          isAbsent,
        });
      }
    });

    return Array.from(grouped.values());
  }, [instructors, bookings, absences, today]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-destructive text-sm">Fehler beim Laden des Stundenplans</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Stundenplan Heute
            <span className="text-xs text-muted-foreground font-normal">
              {format(today, "d. MMMM yyyy", { locale: de })}
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate("/scheduler")}
          >
            Vollansicht
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {instructorBookings.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Keine Buchungen für heute
          </p>
        ) : (
          <div className="space-y-2">
            {instructorBookings.slice(0, 6).map(({ instructor, bookings, isAbsent }) => (
              <div
                key={instructor.id}
                className="flex items-start gap-3 p-2 rounded-md bg-muted/30"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {instructor.first_name} {instructor.last_name}
                    </span>
                    {isAbsent && (
                      <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700">
                        Abwesend
                      </Badge>
                    )}
                  </div>
                  {bookings.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {bookings.slice(0, 3).map((booking) => (
                        <Badge
                          key={booking.id}
                          variant="secondary"
                          className="text-[10px] font-normal"
                        >
                          <Clock className="h-2.5 w-2.5 mr-1" />
                          {booking.timeStart}-{booking.timeEnd}
                        </Badge>
                      ))}
                      {bookings.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{bookings.length - 3} mehr
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Keine Buchungen</p>
                  )}
                </div>
              </div>
            ))}

            {instructorBookings.length > 6 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => navigate("/scheduler")}
              >
                +{instructorBookings.length - 6} weitere Lehrer
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
