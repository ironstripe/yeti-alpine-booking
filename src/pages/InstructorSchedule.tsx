import { useState } from "react";
import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { format, addDays, addWeeks, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";

const timeSlots = ["09", "10", "11", "12", "13", "14", "15", "16"];

export default function InstructorSchedule() {
  const navigate = useNavigate();
  const { instructorId } = useUserRole();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch week schedule
  const { data: weekData, isLoading } = useQuery({
    queryKey: ["instructor-week-schedule", instructorId, weekOffset],
    queryFn: async () => {
      if (!instructorId) return [];

      const { data, error } = await supabase
        .from("ticket_items")
        .select(`
          id,
          date,
          time_start,
          time_end,
          ticket_id,
          products (name, type),
          tickets (ticket_number)
        `)
        .eq("instructor_id", instructorId)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true })
        .order("time_start", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!instructorId,
  });

  // Fetch absences for the week
  const { data: absences } = useQuery({
    queryKey: ["instructor-absences-week", instructorId, weekOffset],
    queryFn: async () => {
      if (!instructorId) return [];

      const { data, error } = await supabase
        .from("instructor_absences")
        .select("*")
        .eq("instructor_id", instructorId)
        .lte("start_date", format(weekEnd, "yyyy-MM-dd"))
        .gte("end_date", format(weekStart, "yyyy-MM-dd"));

      if (error) throw error;
      return data || [];
    },
    enabled: !!instructorId,
  });

  const getBookingsForDay = (date: Date) => {
    return (weekData || []).filter(
      (item: any) => item.date === format(date, "yyyy-MM-dd")
    );
  };

  const isSlotBooked = (date: Date, hour: string) => {
    const bookings = getBookingsForDay(date);
    return bookings.some((booking: any) => {
      if (!booking.time_start) return false;
      const startHour = parseInt(booking.time_start.split(":")[0]);
      const endHour = booking.time_end ? parseInt(booking.time_end.split(":")[0]) : startHour + 1;
      return parseInt(hour) >= startHour && parseInt(hour) < endHour;
    });
  };

  const isDateAbsent = (date: Date) => {
    return (absences || []).some((absence: any) => {
      const start = parseISO(absence.start_date);
      const end = parseISO(absence.end_date);
      return date >= start && date <= end;
    });
  };

  const getDayStats = (date: Date) => {
    const bookings = getBookingsForDay(date);
    const totalMinutes = bookings.reduce((acc: number, booking: any) => {
      if (booking.time_start && booking.time_end) {
        const [startH, startM] = booking.time_start.split(":").map(Number);
        const [endH, endM] = booking.time_end.split(":").map(Number);
        return acc + (endH * 60 + endM) - (startH * 60 + startM);
      }
      return acc;
    }, 0);
    return {
      count: bookings.length,
      hours: Math.round(totalMinutes / 60),
    };
  };

  const getWeekNumber = () => {
    return format(weekStart, "'KW' ww", { locale: de });
  };

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </InstructorLayout>
    );
  }

  return (
    <InstructorLayout>
      <div className="space-y-4">
        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setWeekOffset(prev => prev - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="font-semibold">{getWeekNumber()}</p>
            <p className="text-sm text-muted-foreground">
              {format(weekStart, "d.", { locale: de })} - {format(weekEnd, "d. MMMM yyyy", { locale: de })}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setWeekOffset(prev => prev + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <Tabs defaultValue="week">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="week">Woche</TabsTrigger>
            <TabsTrigger value="list">Liste</TabsTrigger>
          </TabsList>

          <TabsContent value="week" className="mt-4">
            {/* Week Grid */}
            <Card>
              <CardContent className="p-3">
                <div className="grid grid-cols-8 gap-1 text-xs">
                  {/* Header Row */}
                  <div className="font-medium text-muted-foreground"></div>
                  {weekDays.map((day) => (
                    <div 
                      key={day.toISOString()} 
                      className={cn(
                        "text-center py-2 rounded",
                        isSameDay(day, new Date()) && "bg-primary/10 font-semibold"
                      )}
                    >
                      <p className="font-medium">{format(day, "EEE", { locale: de })}</p>
                      <p className={cn(
                        "text-lg",
                        isDateAbsent(day) && "text-destructive"
                      )}>
                        {format(day, "d")}
                      </p>
                    </div>
                  ))}

                  {/* Time Slots */}
                  {timeSlots.map((hour) => (
                    <>
                      <div key={hour} className="text-muted-foreground py-2 text-right pr-2">
                        {hour}:00
                      </div>
                      {weekDays.map((day) => {
                        const booked = isSlotBooked(day, hour);
                        const absent = isDateAbsent(day);
                        return (
                          <div
                            key={`${day.toISOString()}-${hour}`}
                            className={cn(
                              "h-8 rounded-sm",
                              absent && "bg-destructive/20",
                              booked && !absent && "bg-primary",
                              !booked && !absent && "bg-muted/30"
                            )}
                          />
                        );
                      })}
                    </>
                  ))}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 text-xs justify-center">
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-primary" />
                    <span>Gebucht</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-muted/30" />
                    <span>Frei</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-destructive/20" />
                    <span>Abwesend</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Week Stats */}
            <Card className="mt-4">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">
                  DIESE WOCHE
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold">
                      {(weekData || []).length}
                    </p>
                    <p className="text-sm text-muted-foreground">Lektionen</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {Math.round((weekData || []).reduce((acc: number, item: any) => {
                        if (item.time_start && item.time_end) {
                          const [startH, startM] = item.time_start.split(":").map(Number);
                          const [endH, endM] = item.time_end.split(":").map(Number);
                          return acc + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
                        }
                        return acc;
                      }, 0))}h
                    </p>
                    <p className="text-sm text-muted-foreground">Stunden</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="list" className="mt-4 space-y-4">
            {weekDays.map((day) => {
              const bookings = getBookingsForDay(day);
              const stats = getDayStats(day);
              const absent = isDateAbsent(day);

              return (
                <Card 
                  key={day.toISOString()}
                  className={cn(
                    isSameDay(day, new Date()) && "border-primary",
                    absent && "opacity-60"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold capitalize">
                          {format(day, "EEEE, d. MMMM", { locale: de })}
                        </p>
                        {absent && (
                          <Badge variant="destructive" className="mt-1">
                            Abwesend
                          </Badge>
                        )}
                      </div>
                      {!absent && stats.count > 0 && (
                        <Badge variant="secondary">
                          {stats.count} · {stats.hours}h
                        </Badge>
                      )}
                    </div>

                    {!absent && bookings.length > 0 && (
                      <div className="space-y-2">
                        {bookings.map((booking: any) => (
                          <div 
                            key={booking.id}
                            className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 text-sm"
                          >
                            <div>
                              <span className="font-medium">
                                {booking.time_start?.slice(0, 5)} - {booking.time_end?.slice(0, 5)}
                              </span>
                              <span className="text-muted-foreground ml-2">
                                {booking.products?.name || "Lektion"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!absent && bookings.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Keine Lektionen
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </InstructorLayout>
  );
}
