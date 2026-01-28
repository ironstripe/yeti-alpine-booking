import { useState } from "react";
import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronLeft, ChevronRight, ChevronDown, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { format, addWeeks, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const timeSlots = ["09", "10", "11", "12", "13", "14", "15", "16"];

// Color palette for instructors (10 distinct colors that cycle)
const INSTRUCTOR_COLORS = [
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-green-500', text: 'text-white' },
  { bg: 'bg-purple-500', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
  { bg: 'bg-pink-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
  { bg: 'bg-red-500', text: 'text-white' },
  { bg: 'bg-yellow-500', text: 'text-black' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-white' },
];

export default function InstructorSchedule() {
  const { instructorId } = useUserRole();
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'my-bookings' | 'all-instructors'>('my-bookings');
  const [legendOpen, setLegendOpen] = useState(false);

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Fetch all instructors for color mapping (only when in all-instructors mode)
  const { data: allInstructors } = useQuery({
    queryKey: ['all-instructors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instructors')
        .select('id, first_name, last_name')
        .eq('status', 'active')
        .order('first_name', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: viewMode === 'all-instructors',
  });

  // Get color for an instructor
  const getInstructorColor = (instructorIdToCheck: string) => {
    if (!allInstructors) return INSTRUCTOR_COLORS[0];
    const index = allInstructors.findIndex((i) => i.id === instructorIdToCheck);
    return INSTRUCTOR_COLORS[index >= 0 ? index % INSTRUCTOR_COLORS.length : 0];
  };

  // Fetch week schedule (conditionally fetches all instructors' bookings)
  const { data: weekData, isLoading } = useQuery({
    queryKey: ["instructor-week-schedule", instructorId, weekOffset, viewMode],
    queryFn: async () => {
      if (!instructorId) return [];

      let query = supabase
        .from("ticket_items")
        .select(`
          id,
          date,
          time_start,
          time_end,
          ticket_id,
          instructor_id,
          products (name, type),
          tickets (ticket_number),
          instructors (first_name, last_name)
        `)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"))
        .not("instructor_id", "is", null)
        .order("date", { ascending: true })
        .order("time_start", { ascending: true });

      // Filter by instructor only in "my-bookings" mode
      if (viewMode === 'my-bookings') {
        query = query.eq("instructor_id", instructorId);
      }

      const { data, error } = await query;

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

  const getBookingsForSlot = (date: Date, hour: string) => {
    return (weekData || []).filter((booking: any) => {
      if (booking.date !== format(date, "yyyy-MM-dd") || !booking.time_start) return false;
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
    // Filter to only own bookings for stats
    const ownBookings = bookings.filter((b: any) => b.instructor_id === instructorId);
    const totalMinutes = ownBookings.reduce((acc: number, booking: any) => {
      if (booking.time_start && booking.time_end) {
        const [startH, startM] = booking.time_start.split(":").map(Number);
        const [endH, endM] = booking.time_end.split(":").map(Number);
        return acc + (endH * 60 + endM) - (startH * 60 + startM);
      }
      return acc;
    }, 0);
    return {
      count: ownBookings.length,
      hours: Math.round(totalMinutes / 60),
    };
  };

  const getWeekNumber = () => {
    return format(weekStart, "'KW' ww", { locale: de });
  };

  const handleBookingClick = (booking: any) => {
    const isOwn = booking.instructor_id === instructorId;
    
    if (viewMode === 'all-instructors' && !isOwn) {
      // Show limited info for other instructors' bookings
      toast.info(
        `${booking.instructors?.first_name} ${booking.instructors?.last_name}`,
        {
          description: `${booking.time_start?.slice(0, 5)} - ${booking.time_end?.slice(0, 5)} · ${booking.products?.type === 'private' ? 'Privat' : 'Gruppe'}`,
        }
      );
    } else {
      // For own bookings, show full product info
      toast.info(booking.products?.name || 'Buchung', {
        description: `${booking.time_start?.slice(0, 5)} - ${booking.time_end?.slice(0, 5)}`,
      });
    }
  };

  // Calculate own bookings stats
  const ownBookings = (weekData || []).filter((b: any) => b.instructor_id === instructorId);
  const ownHours = Math.round(ownBookings.reduce((acc: number, item: any) => {
    if (item.time_start && item.time_end) {
      const [startH, startM] = item.time_start.split(":").map(Number);
      const [endH, endM] = item.time_end.split(":").map(Number);
      return acc + ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
    }
    return acc;
  }, 0));

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
        {/* View Mode Toggle */}
        <Select 
          value={viewMode} 
          onValueChange={(value) => setViewMode(value as 'my-bookings' | 'all-instructors')}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="my-bookings">Meine Buchungen</SelectItem>
            <SelectItem value="all-instructors">Alle Lehrer</SelectItem>
          </SelectContent>
        </Select>

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
                        const absent = isDateAbsent(day);
                        const slotBookings = getBookingsForSlot(day, hour);
                        const hasBookings = slotBookings.length > 0;
                        
                        return (
                          <div
                            key={`${day.toISOString()}-${hour}`}
                            className={cn(
                              "h-8 rounded-sm relative",
                              absent && "bg-destructive/20",
                              !hasBookings && !absent && "bg-muted/30"
                            )}
                          >
                            {hasBookings && !absent && (
                              <div className="absolute inset-0 flex gap-0.5 p-0.5">
                                {slotBookings.map((booking: any) => {
                                  const isOwn = booking.instructor_id === instructorId;
                                  const color = viewMode === 'all-instructors' && !isOwn
                                    ? getInstructorColor(booking.instructor_id)
                                    : { bg: 'bg-primary', text: 'text-primary-foreground' };
                                  
                                  return (
                                    <div
                                      key={booking.id}
                                      className={cn(
                                        "flex-1 rounded-sm cursor-pointer transition-opacity hover:opacity-80",
                                        color.bg
                                      )}
                                      onClick={() => handleBookingClick(booking)}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ))}
                </div>

                {/* Base Legend */}
                <div className="flex items-center gap-4 mt-4 text-xs justify-center">
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-primary" />
                    <span>{viewMode === 'my-bookings' ? 'Gebucht' : 'Meine'}</span>
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

            {/* Instructor Legend (only in all-instructors mode) */}
            {viewMode === 'all-instructors' && allInstructors && allInstructors.length > 0 && (
              <Card className="mt-4">
                <Collapsible open={legendOpen} onOpenChange={setLegendOpen}>
                  <CollapsibleTrigger asChild>
                    <CardContent className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span className="text-sm font-medium">Legende</span>
                          <Badge variant="secondary" className="text-xs">
                            {allInstructors.length} Lehrer
                          </Badge>
                        </div>
                        <ChevronDown className={cn(
                          "h-4 w-4 transition-transform",
                          legendOpen && "rotate-180"
                        )} />
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                      {allInstructors.map((instructor, index) => {
                        const color = INSTRUCTOR_COLORS[index % INSTRUCTOR_COLORS.length];
                        const isCurrentUser = instructor.id === instructorId;
                        return (
                          <div 
                            key={instructor.id} 
                            className={cn(
                              "flex items-center gap-2 p-1.5 rounded",
                              isCurrentUser && "bg-primary/5 ring-1 ring-primary/20"
                            )}
                          >
                            <div className={cn("w-3 h-3 rounded-sm flex-shrink-0", color.bg)} />
                            <span className={cn(
                              "text-xs truncate",
                              isCurrentUser && "font-medium"
                            )}>
                              {instructor.first_name} {instructor.last_name}
                              {isCurrentUser && " (Du)"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            )}

            {/* Week Stats */}
            <Card className="mt-4">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground uppercase tracking-wide mb-2">
                  {viewMode === 'my-bookings' ? 'DIESE WOCHE' : 'MEINE BUCHUNGEN DIESE WOCHE'}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold">
                      {ownBookings.length}
                    </p>
                    <p className="text-sm text-muted-foreground">Lektionen</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{ownHours}h</p>
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
                        {bookings.map((booking: any) => {
                          const isOwn = booking.instructor_id === instructorId;
                          const color = viewMode === 'all-instructors' && !isOwn
                            ? getInstructorColor(booking.instructor_id)
                            : null;
                          
                          return (
                            <div 
                              key={booking.id}
                              className={cn(
                                "flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer",
                                color ? `${color.bg} ${color.text}` : "bg-muted/50"
                              )}
                              onClick={() => handleBookingClick(booking)}
                            >
                              <div>
                                <span className="font-medium">
                                  {booking.time_start?.slice(0, 5)} - {booking.time_end?.slice(0, 5)}
                                </span>
                                <span className={cn("ml-2", color?.text || "text-muted-foreground")}>
                                  {viewMode === 'all-instructors' && !isOwn
                                    ? `${booking.instructors?.first_name} ${booking.instructors?.last_name?.charAt(0)}.`
                                    : booking.products?.name || "Lektion"
                                  }
                                </span>
                              </div>
                            </div>
                          );
                        })}
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
