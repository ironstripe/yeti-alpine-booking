import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Star, Check, AlertTriangle, Users, MapPin, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import { isCrossDiscipline } from "@/lib/level-utils";
import { getMeetingPointById } from "@/lib/meeting-point-utils";

interface MiniSchedulerGridProps {
  selectedDates: string[];
  sport: "ski" | "snowboard" | null;
  language: string;
  meetingPoint: string | null;
  onSlotSelect: (instructor: Tables<"instructors">, date: string, timeStart: string, timeEnd: string) => void;
  selectedInstructor: Tables<"instructors"> | null;
  preferredTeacher?: string;
  selectedDuration?: number | null;
  selectedStartTime?: string | null;
  participantIds?: string[];
}

// Grid hours: 09:00 - 16:00
const HOURS = [9, 10, 11, 12, 13, 14, 15];

export function MiniSchedulerGrid({
  selectedDates,
  sport,
  language,
  meetingPoint,
  onSlotSelect,
  selectedInstructor,
  preferredTeacher = "",
  selectedDuration,
  selectedStartTime,
  participantIds = [],
}: MiniSchedulerGridProps) {
  // Hover state for preview
  const [hoveredSlot, setHoveredSlot] = useState<{
    instructorId: string;
    date: string;
    hour: number;
  } | null>(null);

  // Determine date range from selected dates
  const dateRange = useMemo(() => {
    if (selectedDates.length === 0) {
      const today = new Date();
      return { start: today, end: today };
    }
    const sorted = [...selectedDates].sort();
    return {
      start: parseISO(sorted[0]),
      end: parseISO(sorted[sorted.length - 1]),
    };
  }, [selectedDates]);

  const { instructors, bookings, absences, isLoading } = useSchedulerData({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  // Fetch booking history for continuity detection
  const { data: bookingHistory = [] } = useQuery({
    queryKey: ["booking-history", participantIds],
    queryFn: async () => {
      if (!participantIds?.length) return [];
      const { data } = await supabase
        .from("ticket_items")
        .select("instructor_id, participant_id, date, meeting_point")
        .in("participant_id", participantIds)
        .not("instructor_id", "is", null)
        .order("date", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: participantIds.length > 0,
  });

  // Check for continuity match (instructor taught participant before)
  const hasContinuityMatch = (instructorId: string) => {
    return bookingHistory.some((h) => h.instructor_id === instructorId);
  };

  // Get material conflict for adjacent bookings with different sport
  const getMaterialConflict = (instructorId: string, dateStr: string, hour: number) => {
    const dayBookings = bookings.filter(
      (b) => b.instructorId === instructorId && b.date === dateStr
    );
    
    for (const booking of dayBookings) {
      const bookingStart = parseInt(booking.timeStart.split(":")[0]);
      const bookingEnd = parseInt(booking.timeEnd.split(":")[0]);
      const bookingSport = booking.participantSport;
      
      // Check if adjacent
      const isAdjacent = (hour === bookingEnd) || 
        (selectedDuration && (hour + selectedDuration === bookingStart));
      
      if (isAdjacent && bookingSport && sport && bookingSport !== sport) {
        return {
          type: "material" as const,
          message: `Materialwechsel: ${bookingSport === "ski" ? "Ski" : "Snowboard"} → ${sport === "ski" ? "Ski" : "Snowboard"}`,
        };
      }
    }
    return null;
  };

  // Get location conflict for different meeting points
  const getLocationConflict = (instructorId: string) => {
    if (!meetingPoint) return null;
    
    for (const dateStr of selectedDates) {
      const dayBookings = bookings.filter(
        (b) => b.instructorId === instructorId && b.date === dateStr
      );
      
      for (const booking of dayBookings) {
        const bookingMeetingPoint = (booking as any).meetingPoint;
        if (bookingMeetingPoint && bookingMeetingPoint !== meetingPoint) {
          const otherPoint = getMeetingPointById(bookingMeetingPoint);
          const newPoint = getMeetingPointById(meetingPoint);
          return {
            type: "location" as const,
            message: `Standortwechsel: ${otherPoint.name} → ${newPoint.name}`,
          };
        }
      }
    }
    return null;
  };

  // Calculate hours booked for an instructor on selected dates
  const getHoursBooked = (instructorId: string) => {
    let total = 0;
    for (const dateStr of selectedDates) {
      const dayBookings = bookings.filter(
        (b) => b.instructorId === instructorId && b.date === dateStr
      );
      for (const b of dayBookings) {
        const start = parseInt(b.timeStart.split(":")[0]);
        const end = parseInt(b.timeEnd.split(":")[0]);
        total += end - start;
      }
    }
    return total;
  };

  // Check if instructor is available for the selected time window
  const isAvailableForSelectedTime = (instructor: typeof instructors[0]) => {
    if (!selectedStartTime || !selectedDuration) return true; // No time selected = show all
    
    const startHour = parseInt(selectedStartTime.split(":")[0]);
    
    for (const dateStr of selectedDates) {
      for (let h = startHour; h < startHour + selectedDuration && h < 16; h++) {
        const { available } = isSlotAvailable(instructor.id, dateStr, h);
        if (!available) return false;
      }
    }
    return true;
  };

  // Filter and sort instructors by 4-Tier Ranking Algorithm
  const sortedInstructors = useMemo(() => {
    if (!instructors) return [];

    // Filter by sport if specified
    let filtered = instructors.filter((i) => i.status === "active");
    if (sport) {
      filtered = filtered.filter(
        (i) => i.specialization === sport || i.specialization === "both"
      );
    }

    // Filter by language if specified
    if (language && language !== "de") {
      filtered = filtered.filter(
        (i) => i.languages?.includes(language) || i.languages?.includes("de")
      );
    }

    // 4-Tier Ranking Algorithm
    const getAvailabilityScore = (instructor: typeof instructors[0]) => {
      let score = 0;
      
      // ========== RULE A: Requested Teacher (Highest Priority) ==========
      if (preferredTeacher && preferredTeacher.trim().length >= 2) {
        const fullName = `${instructor.first_name} ${instructor.last_name}`.toLowerCase();
        if (fullName.includes(preferredTeacher.toLowerCase())) {
          score += 10000; // Absolute top priority
        }
      }
      
      // ========== RULE B: Continuity Bonus ==========
      if (hasContinuityMatch(instructor.id)) {
        score += 500; // Strong bonus for pedagogical continuity
      }
      
      // ========== RULE C: Density Optimization (Fill-Before-Activate) ==========
      for (const dateStr of selectedDates) {
        const dayBookings = bookings.filter(
          (b) => b.instructorId === instructor.id && b.date === dateStr
        );
        const hoursBooked = dayBookings.reduce((sum, b) => {
          const start = parseInt(b.timeStart.split(":")[0]);
          const end = parseInt(b.timeEnd.split(":")[0]);
          return sum + (end - start);
        }, 0);
        
        // Prefer instructors with 1-3 hours (fill to 4-5h target)
        if (hoursBooked >= 1 && hoursBooked <= 3) {
          score += 100; // Fill existing schedule bonus
        } else if (hoursBooked >= 4 && hoursBooked <= 5) {
          score += 20; // Near optimal, slight bonus
        } else if (hoursBooked >= 6) {
          score -= 200; // Overworked penalty
        }
        
        // Check if absent on this date
        const isAbsent = absences.some(
          (a) =>
            a.instructorId === instructor.id &&
            dateStr >= a.startDate &&
            dateStr <= a.endDate
        );
        if (isAbsent) {
          score -= 1000; // Heavy penalty for absence
        }
      }
      
      // ========== RULE D: Efficiency Guard ==========
      const hasAnyBookings = selectedDates.some(dateStr => 
        bookings.some(b => b.instructorId === instructor.id && b.date === dateStr)
      );
      if (!hasAnyBookings) {
        // Avoid 1h shifts for inactive instructors
        if (selectedDuration === 1) {
          score -= 50;
        }
        score -= 30; // General penalty for activating new instructor
      }

      // Status bonus
      if (instructor.real_time_status === "available") score += 20;
      if (instructor.real_time_status === "on_call") score += 5;

      return score;
    };

    // Sort: available for selected time first, then by score
    return filtered.sort((a, b) => {
      // First: Sort by availability for selected time
      const aAvailable = isAvailableForSelectedTime(a);
      const bAvailable = isAvailableForSelectedTime(b);
      
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;
      
      // Then: Apply 4-tier ranking
      const scoreA = getAvailabilityScore(a);
      const scoreB = getAvailabilityScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.last_name.localeCompare(b.last_name);
    });
  }, [instructors, sport, language, selectedDates, bookings, absences, preferredTeacher, bookingHistory, selectedDuration, selectedStartTime]);

  // Check if a slot is available
  const isSlotAvailable = (instructorId: string, date: string, hour: number) => {
    const timeStart = `${hour.toString().padStart(2, "0")}:00`;
    const timeEnd = `${(hour + 1).toString().padStart(2, "0")}:00`;

    // Check for booking overlap
    const hasBooking = bookings.some((b) => {
      if (b.instructorId !== instructorId || b.date !== date) return false;
      const bookingStart = parseInt(b.timeStart.split(":")[0]);
      const bookingEnd = parseInt(b.timeEnd.split(":")[0]);
      return hour >= bookingStart && hour < bookingEnd;
    });

    // Check for absence
    const hasAbsence = absences.some(
      (a) =>
        a.instructorId === instructorId &&
        date >= a.startDate &&
        date <= a.endDate
    );

    return { available: !hasBooking && !hasAbsence, booked: hasBooking, absent: hasAbsence };
  };

  // Check if slot is within selected duration window
  const isWithinSelectedDuration = (hour: number) => {
    if (!selectedStartTime || !selectedDuration) return false;
    const startHour = parseInt(selectedStartTime.split(":")[0]);
    return hour >= startHour && hour < startHour + selectedDuration;
  };

  // Check if slot is in hover preview range
  const isInHoverPreview = (instructorId: string, date: string, hour: number) => {
    if (!hoveredSlot || !selectedDuration) return false;
    if (hoveredSlot.instructorId !== instructorId || hoveredSlot.date !== date) return false;
    return hour >= hoveredSlot.hour && hour < hoveredSlot.hour + selectedDuration;
  };

  // Check if entire duration block is available for hover preview
  const isDurationBlockAvailable = (instructorId: string, date: string, startHour: number) => {
    if (!selectedDuration) return true;
    for (let h = startHour; h < startHour + selectedDuration && h < 16; h++) {
      const { available } = isSlotAvailable(instructorId, date, h);
      if (!available) return false;
    }
    return true;
  };

  // Get instructor meeting point conflicts
  const getInstructorWarning = (instructorId: string) => {
    if (!meetingPoint) return null;
    
    for (const dateStr of selectedDates) {
      const dayBookings = bookings.filter(
        (b) => b.instructorId === instructorId && b.date === dateStr
      );
      
      for (const booking of dayBookings) {
        // Check if meeting point differs (booking.meetingPoint from scheduler data)
        const bookingMeetingPoint = (booking as any).meetingPoint;
        if (bookingMeetingPoint && bookingMeetingPoint !== meetingPoint) {
          const otherPoint = getMeetingPointById(bookingMeetingPoint);
          return `Wechselt von ${otherPoint.name}`;
        }
      }
      
      // Just has other bookings
      if (dayBookings.length > 0) {
        return "Hat bereits Buchungen";
      }
    }
    return null;
  };

  // Get discipline icon
  const getDisciplineIcon = (specialization: string | null) => {
    if (specialization === "ski") return "⛷️";
    if (specialization === "snowboard") return "🏂";
    if (specialization === "both") return "⛷️🏂";
    return "";
  };

  if (selectedDates.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
        Bitte wählen Sie zuerst ein Datum
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Lade Verfügbarkeit...</div>
      </div>
    );
  }

  if (sortedInstructors.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
        Keine passenden Skilehrer gefunden
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-1">
        {/* Compact header with ranking legend */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>Verfügbare Skilehrer</span>
          </div>
          <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground">
            <div className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span>Empfehlung</span>
            </div>
            <Badge variant="outline" className="h-3.5 px-1 text-[8px] bg-purple-50 text-purple-700 border-purple-200">
              Kontinuität
            </Badge>
            <div className="flex items-center gap-0.5">
              <div className="h-2 w-2 rounded-sm bg-emerald-100 border border-emerald-400" />
              <span>Frei</span>
            </div>
            <div className="flex items-center gap-0.5">
              <div className="h-2 w-2 rounded-sm bg-rose-100 border border-rose-400" />
              <span>Belegt</span>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[420px] rounded-lg border border-slate-300">
          <div className="min-w-[500px]">
            {/* Time header */}
            <div className="sticky top-0 z-10 flex border-b border-slate-300 bg-slate-100">
              <div className="w-28 flex-shrink-0 border-r border-slate-300 px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                Lehrer
              </div>
              {HOURS.map((hour) => {
                const isHighlighted = isWithinSelectedDuration(hour);
                return (
                  <div
                    key={hour}
                    className={cn(
                      "flex-1 border-r border-slate-200 px-1 py-1 text-center text-[10px] font-semibold text-muted-foreground last:border-r-0",
                      isHighlighted && "bg-primary/10 text-primary"
                    )}
                  >
                    {hour}:00
                  </div>
                );
              })}
            </div>

            {/* Instructor rows */}
            {sortedInstructors.slice(0, 14).map((instructor, idx) => {
              const isRecommended = idx === 0;
              const isContinuity = hasContinuityMatch(instructor.id);
              const locationConflict = getLocationConflict(instructor.id);
              const isSelected = selectedInstructor?.id === instructor.id;
              const isCross = isCrossDiscipline(instructor.specialization, sport);
              const disciplineIcon = getDisciplineIcon(instructor.specialization);
              const hoursToday = getHoursBooked(instructor.id);
              const isUnavailableForTime = selectedStartTime && selectedDuration && !isAvailableForSelectedTime(instructor);

              return (
                <div
                  key={instructor.id}
                  className={cn(
                    "flex border-b border-slate-300 last:border-b-0 transition-colors",
                    idx % 2 === 1 && "bg-slate-50/50",
                    isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30",
                    isContinuity && !isSelected && "border-l-2 border-l-purple-400",
                    isUnavailableForTime && !isSelected && "opacity-50 bg-slate-100"
                  )}
                >
                  {/* Instructor name column */}
                  <div className="w-28 flex-shrink-0 border-r border-slate-300 px-1.5 py-0.5">
                    <div className="flex items-center gap-0.5">
                      <span className="text-[10px] flex-shrink-0">{disciplineIcon}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate text-[11px] font-medium cursor-help">
                            {instructor.first_name.charAt(0)}. {instructor.last_name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="font-medium">{instructor.first_name} {instructor.last_name}</p>
                          {instructor.languages && (
                            <p className="text-xs text-muted-foreground">
                              Sprachen: {instructor.languages.join(", ")}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Status: {instructor.real_time_status || "unbekannt"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Heute: {hoursToday}h gebucht
                          </p>
                        </TooltipContent>
                      </Tooltip>
                      {isRecommended && !isSelected && (
                        <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      {isSelected && (
                        <Check className="h-2.5 w-2.5 flex-shrink-0 text-primary" />
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 mt-0">
                      {isContinuity && (
                        <Badge variant="outline" className="h-3 px-0.5 text-[7px] py-0 bg-purple-50 text-purple-700 border-purple-200">
                          Kontinuität
                        </Badge>
                      )}
                      {isCross && (
                        <Badge variant="outline" className="h-3 px-0.5 text-[8px] py-0">
                          Fachfremd
                        </Badge>
                      )}
                      {locationConflict && (
                        <Tooltip>
                          <TooltipTrigger>
                            <MapPin className="h-2.5 w-2.5 text-blue-500" />
                          </TooltipTrigger>
                          <TooltipContent>{locationConflict.message}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Time slots for each selected date (stacked if multiple) */}
                  <div className="flex flex-1 flex-col">
                    {selectedDates.map((dateStr) => (
                      <div key={dateStr} className="flex">
                        {selectedDates.length > 1 && (
                          <div className="w-8 flex-shrink-0 border-r border-slate-200 px-0.5 py-0.5 text-[8px] text-muted-foreground flex items-center">
                            {format(parseISO(dateStr), "E d.", { locale: de })}
                          </div>
                        )}
                        {HOURS.map((hour) => {
                          const { available, booked, absent } = isSlotAvailable(instructor.id, dateStr, hour);
                          const timeStart = `${hour.toString().padStart(2, "0")}:00`;
                          const timeEnd = `${(hour + 1).toString().padStart(2, "0")}:00`;
                          const isHighlightedDuration = isWithinSelectedDuration(hour) && available;
                          const isHoverPreview = isInHoverPreview(instructor.id, dateStr, hour);
                          const canBookDuration = isDurationBlockAvailable(instructor.id, dateStr, hour);
                          const materialConflict = getMaterialConflict(instructor.id, dateStr, hour);

                          return (
                            <Tooltip key={hour}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={!available}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (available) {
                                      onSlotSelect(instructor, dateStr, timeStart, timeEnd);
                                    }
                                  }}
                                  onMouseEnter={() => {
                                    if (available && selectedDuration) {
                                      setHoveredSlot({ instructorId: instructor.id, date: dateStr, hour });
                                    }
                                  }}
                                  onMouseLeave={() => setHoveredSlot(null)}
                                  className={cn(
                                    "h-6 flex-1 border-r border-slate-200 transition-all last:border-r-0 relative",
                                    available
                                      ? "cursor-pointer bg-emerald-50 hover:bg-emerald-200"
                                      : booked
                                      ? "cursor-not-allowed bg-rose-100"
                                      : absent
                                      ? "cursor-not-allowed bg-slate-800"
                                      : "cursor-not-allowed bg-slate-200",
                                    // Duration highlight for matching time window
                                    isHighlightedDuration && "ring-2 ring-inset ring-primary/50",
                                    // Hover preview for booking block
                                    isHoverPreview && canBookDuration && "bg-blue-100",
                                    isHoverPreview && !canBookDuration && "bg-rose-200",
                                    // Selected instructor slot highlight
                                    isSelected && available && "bg-primary/10 hover:bg-primary/20",
                                    // Material conflict warning
                                    materialConflict && available && "ring-1 ring-amber-500"
                                  )}
                                >
                                  {materialConflict && available && (
                                    <RefreshCw className="h-2 w-2 absolute top-0.5 right-0.5 text-amber-600" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              {materialConflict && (
                                <TooltipContent className="text-xs">
                                  {materialConflict.message}
                                  <br />
                                  <span className="text-amber-600">30 Min. Puffer empfohlen</span>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {sortedInstructors.length > 14 && (
          <p className="text-[9px] text-muted-foreground text-center">
            +{sortedInstructors.length - 14} weitere Skilehrer
          </p>
        )}
        
        {/* Admin override hint */}
        <p className="text-[9px] text-muted-foreground text-center italic">
          Empfehlungen sind Richtlinien. Klicken Sie auf jeden freien Slot für manuelle Zuweisung.
        </p>
      </div>
    </TooltipProvider>
  );
}