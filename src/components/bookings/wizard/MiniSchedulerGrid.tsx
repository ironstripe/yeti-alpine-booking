import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Star, Check, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import { isCrossDiscipline } from "@/lib/level-utils";

interface MiniSchedulerGridProps {
  selectedDates: string[];
  sport: "ski" | "snowboard" | null;
  language: string;
  meetingPoint: string | null;
  onSlotSelect: (instructor: Tables<"instructors">, date: string, timeStart: string, timeEnd: string) => void;
  selectedInstructor: Tables<"instructors"> | null;
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
}: MiniSchedulerGridProps) {
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

  // Filter and sort instructors by Best-Match algorithm
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

    // Check availability for all selected dates
    const getAvailabilityScore = (instructor: typeof instructors[0]) => {
      let score = 0;
      
      for (const dateStr of selectedDates) {
        // Check if absent on this date
        const isAbsent = absences.some(
          (a) =>
            a.instructorId === instructor.id &&
            dateStr >= a.startDate &&
            dateStr <= a.endDate
        );
        if (isAbsent) {
          score -= 100; // Heavy penalty for absence
        }

        // Check how many hours already booked
        const dayBookings = bookings.filter(
          (b) => b.instructorId === instructor.id && b.date === dateStr
        );
        // Prefer instructors with some bookings (fill-before-activate) but not fully booked
        if (dayBookings.length > 0 && dayBookings.length < 6) {
          score += 10; // Bonus for filling existing schedule
        } else if (dayBookings.length >= 6) {
          score -= 50; // Penalty for nearly full
        }
      }

      // Status bonus
      if (instructor.real_time_status === "available") score += 20;
      if (instructor.real_time_status === "on_call") score += 5;

      return score;
    };

    return filtered.sort((a, b) => {
      const scoreA = getAvailabilityScore(a);
      const scoreB = getAvailabilityScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.last_name.localeCompare(b.last_name);
    });
  }, [instructors, sport, language, selectedDates, bookings, absences]);

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

    return !hasBooking && !hasAbsence;
  };

  // Get instructor meeting point conflicts
  const getInstructorWarning = (instructorId: string) => {
    if (!meetingPoint) return null;
    
    for (const dateStr of selectedDates) {
      const dayBookings = bookings.filter(
        (b) => b.instructorId === instructorId && b.date === dateStr
      );
      // This would need to check the meeting point of existing bookings
      // For now, we just check if they have other bookings
      if (dayBookings.length > 0) {
        return "Hat bereits Buchungen an diesem Tag";
      }
    }
    return null;
  };

  if (selectedDates.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        Bitte wählen Sie zuerst Datum und Uhrzeit
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Lade Verfügbarkeit...</div>
      </div>
    );
  }

  if (sortedInstructors.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        Keine passenden Skilehrer gefunden
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" />
            <span>Verfügbar</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-slate-200 border border-slate-400" />
            <span>Belegt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-primary/20 border-2 border-primary" />
            <span>Ausgewählt</span>
          </div>
        </div>

        <ScrollArea className="h-[320px] rounded-lg border">
          <div className="min-w-[500px]">
            {/* Time header */}
            <div className="sticky top-0 z-10 flex border-b bg-slate-50">
              <div className="w-28 flex-shrink-0 border-r p-2 text-xs font-medium text-muted-foreground">
                Skilehrer
              </div>
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="flex-1 border-r p-1 text-center text-xs font-medium text-muted-foreground last:border-r-0"
                >
                  {hour}:00
                </div>
              ))}
            </div>

            {/* Instructor rows */}
            {sortedInstructors.slice(0, 10).map((instructor, idx) => {
              const isRecommended = idx === 0;
              const warning = getInstructorWarning(instructor.id);
              const isSelected = selectedInstructor?.id === instructor.id;
              const isCross = isCrossDiscipline(instructor.specialization, sport);

              return (
                <div
                  key={instructor.id}
                  className={cn(
                    "flex border-b last:border-b-0",
                    idx % 2 === 1 && "bg-slate-50/50",
                    isSelected && "bg-primary/5"
                  )}
                >
                  {/* Instructor name */}
                  <div className="w-28 flex-shrink-0 border-r p-2">
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate text-sm font-medium cursor-help">
                            {instructor.first_name.charAt(0)}. {instructor.last_name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{instructor.first_name} {instructor.last_name}</p>
                          {instructor.languages && (
                            <p className="text-xs text-muted-foreground">
                              {instructor.languages.join(", ")}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                      {isRecommended && (
                        <Star className="h-3 w-3 flex-shrink-0 text-amber-500" />
                      )}
                      {isSelected && (
                        <Check className="h-3 w-3 flex-shrink-0 text-primary" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {isCross && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                          Fachfremd
                        </Badge>
                      )}
                      {warning && (
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                          </TooltipTrigger>
                          <TooltipContent>{warning}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Time slots for each selected date (stacked if multiple) */}
                  <div className="flex flex-1 flex-col">
                    {selectedDates.map((dateStr) => (
                      <div key={dateStr} className="flex">
                        {selectedDates.length > 1 && (
                          <div className="w-12 flex-shrink-0 border-r p-1 text-[10px] text-muted-foreground">
                            {format(parseISO(dateStr), "E d.", { locale: de })}
                          </div>
                        )}
                        {HOURS.map((hour) => {
                          const available = isSlotAvailable(instructor.id, dateStr, hour);
                          const timeStart = `${hour.toString().padStart(2, "0")}:00`;
                          const timeEnd = `${(hour + 1).toString().padStart(2, "0")}:00`;

                          return (
                            <button
                              key={hour}
                              disabled={!available}
                              onClick={() => {
                                if (available) {
                                  onSlotSelect(instructor, dateStr, timeStart, timeEnd);
                                }
                              }}
                              className={cn(
                                "h-8 flex-1 border-r transition-colors last:border-r-0",
                                available
                                  ? "cursor-pointer bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400"
                                  : "cursor-not-allowed bg-slate-200",
                                isSelected && available && "bg-primary/10 hover:bg-primary/20"
                              )}
                            />
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

        {sortedInstructors.length > 10 && (
          <p className="text-xs text-muted-foreground text-center">
            +{sortedInstructors.length - 10} weitere Skilehrer
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}