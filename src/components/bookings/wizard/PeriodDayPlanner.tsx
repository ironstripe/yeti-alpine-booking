import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar, Check, AlertTriangle, User, Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

import { useInstructors, getStatusConfig } from "@/hooks/useInstructors";
import type { Tables } from "@/integrations/supabase/types";
import type { DayTimeOverride } from "@/contexts/BookingWizardContext";

// Available time slots
const TIME_OPTIONS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"
];

interface PeriodDayPlannerProps {
  selectedDates: string[];
  baseInstructor: Tables<"instructors"> | null;
  baseTimeSlot: string | null; // "10:00 - 12:00"
  dayInstructorOverrides: Record<string, string | null>;
  dayTimeOverrides: Record<string, DayTimeOverride>;
  onInstructorChange: (date: string, instructorId: string | null) => void;
  onTimeChange: (date: string, startTime: string, endTime: string) => void;
  sport: "ski" | "snowboard" | null;
}

export function PeriodDayPlanner({
  selectedDates,
  baseInstructor,
  baseTimeSlot,
  dayInstructorOverrides,
  dayTimeOverrides,
  onInstructorChange,
  onTimeChange,
  sport,
}: PeriodDayPlannerProps) {
  const { data: instructors, isLoading } = useInstructors();

  // Parse base time slot
  const baseStartTime = baseTimeSlot?.split(" - ")[0] || "10:00";
  const baseEndTime = baseTimeSlot?.split(" - ")[1] || "12:00";

  // Filter instructors by sport
  const availableInstructors = useMemo(() => {
    if (!instructors) return [];
    let filtered = instructors.filter((i) => i.status === "active");
    if (sport) {
      filtered = filtered.filter(
        (i) => i.specialization === sport || i.specialization === "both"
      );
    }
    return filtered.sort((a, b) => a.last_name.localeCompare(b.last_name));
  }, [instructors, sport]);

  // Sort dates chronologically
  const sortedDates = useMemo(() => {
    return [...selectedDates].sort();
  }, [selectedDates]);

  // Count how many days have overrides
  const overrideCount = useMemo(() => {
    return sortedDates.filter((date) => {
      const hasInstructorOverride = dayInstructorOverrides[date] && 
        dayInstructorOverrides[date] !== baseInstructor?.id;
      const hasTimeOverride = dayTimeOverrides[date] && (
        dayTimeOverrides[date].startTime !== baseStartTime ||
        dayTimeOverrides[date].endTime !== baseEndTime
      );
      return hasInstructorOverride || hasTimeOverride;
    }).length;
  }, [sortedDates, dayInstructorOverrides, dayTimeOverrides, baseInstructor, baseStartTime, baseEndTime]);

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getInstructorById = (id: string | null | undefined) => {
    if (!id) return null;
    return availableInstructors.find((i) => i.id === id) || null;
  };

  const getDayInstructor = (date: string) => {
    const overrideId = dayInstructorOverrides[date];
    if (overrideId !== undefined) {
      return getInstructorById(overrideId);
    }
    return baseInstructor;
  };

  const getDayTime = (date: string) => {
    const override = dayTimeOverrides[date];
    if (override) {
      return { startTime: override.startTime, endTime: override.endTime };
    }
    return { startTime: baseStartTime, endTime: baseEndTime };
  };

  const isDayOverridden = (date: string) => {
    const dayInstructor = getDayInstructor(date);
    const dayTime = getDayTime(date);
    
    const hasInstructorOverride = dayInstructor?.id !== baseInstructor?.id;
    const hasTimeOverride = 
      dayTime.startTime !== baseStartTime || 
      dayTime.endTime !== baseEndTime;
    
    return hasInstructorOverride || hasTimeOverride;
  };

  // Generate available end times based on start time
  const getAvailableEndTimes = (startTime: string) => {
    const startHour = parseInt(startTime.split(":")[0]);
    return TIME_OPTIONS.filter((time) => {
      const hour = parseInt(time.split(":")[0]);
      return hour > startHour && hour <= 16;
    });
  };

  if (selectedDates.length <= 1) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="animate-pulse h-20 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed">
      <Collapsible defaultOpen={overrideCount > 0}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Tagesplanung
                {overrideCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {overrideCount} {overrideCount === 1 ? "Änderung" : "Änderungen"}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Klicken zum {overrideCount > 0 ? "Bearbeiten" : "Anpassen"}
              </p>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-muted-foreground mb-4">
              Standard: {baseInstructor ? `${baseInstructor.first_name} ${baseInstructor.last_name}` : "Nicht zugewiesen"}, {baseStartTime} - {baseEndTime}
            </p>
            
            {sortedDates.map((date) => {
              const dayInstructor = getDayInstructor(date);
              const dayTime = getDayTime(date);
              const isOverridden = isDayOverridden(date);
              const statusConfig = dayInstructor ? getStatusConfig(dayInstructor.real_time_status) : null;

              return (
                <div
                  key={date}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isOverridden 
                      ? "border-amber-300 bg-amber-50/50" 
                      : "border-muted bg-muted/30"
                  }`}
                >
                  {/* Date */}
                  <div className="w-24 shrink-0">
                    <p className="text-sm font-medium">
                      {format(parseISO(date), "EEE, d.", { locale: de })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(date), "MMM", { locale: de })}
                    </p>
                  </div>

                  {/* Time Selection */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Select
                      value={dayTime.startTime}
                      onValueChange={(value) => {
                        const currentEnd = dayTime.endTime;
                        const newEndHour = parseInt(value.split(":")[0]) + 2;
                        const newEnd = newEndHour <= 16 
                          ? `${newEndHour.toString().padStart(2, "0")}:00`
                          : currentEnd;
                        onTimeChange(date, value, newEnd);
                      }}
                    >
                      <SelectTrigger className="w-20 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.filter(t => parseInt(t.split(":")[0]) < 16).map((time) => (
                          <SelectItem key={time} value={time} className="text-xs">
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">-</span>
                    <Select
                      value={dayTime.endTime}
                      onValueChange={(value) => onTimeChange(date, dayTime.startTime, value)}
                    >
                      <SelectTrigger className="w-20 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableEndTimes(dayTime.startTime).map((time) => (
                          <SelectItem key={time} value={time} className="text-xs">
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Instructor Selection */}
                  <div className="flex-1 min-w-0">
                    <Select
                      value={dayInstructor?.id || "none"}
                      onValueChange={(value) => {
                        onInstructorChange(date, value === "none" ? null : value);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue>
                          {dayInstructor ? (
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-[10px]">
                                    {getInitials(dayInstructor.first_name, dayInstructor.last_name)}
                                  </AvatarFallback>
                                </Avatar>
                                {statusConfig && (
                                  <div
                                    className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${statusConfig.color}`}
                                  />
                                )}
                              </div>
                              <span className="truncate">
                                {dayInstructor.first_name} {dayInstructor.last_name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Nicht zugewiesen</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs">
                          <span className="text-muted-foreground">Nicht zugewiesen</span>
                        </SelectItem>
                        {availableInstructors.map((instructor) => {
                          const instStatusConfig = getStatusConfig(instructor.real_time_status);
                          return (
                            <SelectItem 
                              key={instructor.id} 
                              value={instructor.id}
                              className="text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <Avatar className="h-5 w-5">
                                    <AvatarFallback className="text-[10px]">
                                      {getInitials(instructor.first_name, instructor.last_name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div
                                    className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${instStatusConfig.color}`}
                                  />
                                </div>
                                <span>
                                  {instructor.first_name} {instructor.last_name}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0">
                    {isOverridden ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-xs gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Angepasst
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300 text-xs gap-1">
                        <Check className="h-3 w-3" />
                        Standard
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Reset button if there are overrides */}
            {overrideCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  // Reset all overrides for displayed dates
                  sortedDates.forEach((date) => {
                    if (dayInstructorOverrides[date] !== undefined) {
                      onInstructorChange(date, null);
                    }
                    if (dayTimeOverrides[date]) {
                      onTimeChange(date, baseStartTime, baseEndTime);
                    }
                  });
                }}
              >
                Alle Anpassungen zurücksetzen
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
