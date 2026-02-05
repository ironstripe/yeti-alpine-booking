import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar, Check, AlertTriangle, Plus, Trash2 } from "lucide-react";

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
import type { TimeBlock } from "@/contexts/BookingWizardContext";

// Available time slots
const TIME_OPTIONS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"
];

interface PeriodDayPlannerProps {
  selectedDates: string[];
  baseInstructor: Tables<"instructors"> | null;
  baseTimeSlot: string | null; // "10:00 - 12:00"
  dayInstructorOverrides: Record<string, string | null>;
  dayTimeOverrides: Record<string, TimeBlock[]>;
  onInstructorChange: (date: string, instructorId: string | null) => void;
  onTimeChange: (date: string, startTime: string, endTime: string) => void;
  onAddTimeBlock: (date: string, startTime: string, endTime: string) => void;
  onUpdateTimeBlock: (date: string, blockId: string, startTime: string, endTime: string) => void;
  onRemoveTimeBlock: (date: string, blockId: string) => void;
  onRemoveInstructorOverride: (date: string) => void;
  onRemoveTimeOverride: (date: string) => void;
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
  onAddTimeBlock,
  onUpdateTimeBlock,
  onRemoveTimeBlock,
  onRemoveInstructorOverride,
  onRemoveTimeOverride,
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
      const timeBlocks = dayTimeOverrides[date] || [];
      const hasTimeOverride = timeBlocks.length > 0 && (
        timeBlocks.length > 1 ||
        timeBlocks[0]?.startTime !== baseStartTime ||
        timeBlocks[0]?.endTime !== baseEndTime
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

  // Get all time blocks for a day (with fallback to base time if no overrides)
  const getDayTimeBlocks = (date: string): TimeBlock[] => {
    const blocks = dayTimeOverrides[date];
    if (blocks && blocks.length > 0) {
      return blocks;
    }
    // Return base time as single block
    return [{ id: "base", startTime: baseStartTime, endTime: baseEndTime }];
  };

  // Check if day has any overrides from base
  const isDayOverridden = (date: string) => {
    const dayInstructor = getDayInstructor(date);
    const blocks = dayTimeOverrides[date] || [];
    
    const hasInstructorOverride = dayInstructor?.id !== baseInstructor?.id;
    const hasTimeOverride = blocks.length > 0 && (
      blocks.length > 1 ||
      blocks[0]?.startTime !== baseStartTime ||
      blocks[0]?.endTime !== baseEndTime
    );
    
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
              const timeBlocks = getDayTimeBlocks(date);
              const isOverridden = isDayOverridden(date);
              const statusConfig = dayInstructor ? getStatusConfig(dayInstructor.real_time_status) : null;

              return (
                <div
                  key={date}
                  className={`p-3 rounded-lg border transition-colors space-y-2 ${
                    isOverridden 
                      ? "border-amber-300 bg-amber-50/50" 
                      : "border-muted bg-muted/30"
                  }`}
                >
                  {/* Header row with Date, Instructor, and Status */}
                  <div className="flex items-center gap-3">
                    {/* Date */}
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-medium">
                        {format(parseISO(date), "EEE, d.", { locale: de })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(date), "MMM", { locale: de })}
                      </p>
                    </div>

                    {/* Instructor Selection */}
                    <div className="flex-1 min-w-0">
                      <Select
                        value={dayInstructor?.id || "none"}
                        onValueChange={(value) => {
                          if (value === "none") {
                            onInstructorChange(date, null);
                          } else if (value === baseInstructor?.id) {
                            onRemoveInstructorOverride(date);
                          } else {
                            onInstructorChange(date, value);
                          }
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

                  {/* Time Blocks */}
                  <div className="pl-24 space-y-2">
                    {timeBlocks.map((block, blockIndex) => (
                      <div key={block.id} className="flex items-center gap-2">
                        <div className="flex items-center gap-1 shrink-0">
                          <Select
                            value={block.startTime}
                            onValueChange={(value) => {
                              const newEndHour = parseInt(value.split(":")[0]) + 2;
                              const newEnd = newEndHour <= 16 
                                ? `${newEndHour.toString().padStart(2, "0")}:00`
                                : block.endTime;
                              
                              if (block.id === "base") {
                                // First block or base, use onTimeChange
                                onTimeChange(date, value, newEnd);
                              } else {
                                onUpdateTimeBlock(date, block.id, value, newEnd);
                              }
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
                            value={block.endTime}
                            onValueChange={(value) => {
                              if (block.id === "base") {
                                onTimeChange(date, block.startTime, value);
                              } else {
                                onUpdateTimeBlock(date, block.id, block.startTime, value);
                              }
                            }}
                          >
                            <SelectTrigger className="w-20 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {getAvailableEndTimes(block.startTime).map((time) => (
                                <SelectItem key={time} value={time} className="text-xs">
                                  {time}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Remove button (only show if more than one block or if it's an override) */}
                        {(timeBlocks.length > 1 || block.id !== "base") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (block.id === "base") {
                                // Removing the base/first block resets to default
                                onRemoveTimeOverride(date);
                              } else {
                                onRemoveTimeBlock(date, block.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    
                    {/* Add Time Block Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        // Calculate default new block time (after last block)
                        const lastBlock = timeBlocks[timeBlocks.length - 1];
                        const lastEndHour = parseInt(lastBlock.endTime.split(":")[0]);
                        const newStart = lastEndHour < 14 ? `${(lastEndHour + 1).toString().padStart(2, "0")}:00` : "14:00";
                        const newEnd = Math.min(parseInt(newStart.split(":")[0]) + 2, 16).toString().padStart(2, "0") + ":00";
                        onAddTimeBlock(date, newStart, newEnd);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Weiterer Zeitblock
                    </Button>
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
                  // Reset all overrides by REMOVING the keys (not setting to null)
                  sortedDates.forEach((date) => {
                    if (dayInstructorOverrides[date] !== undefined) {
                      onRemoveInstructorOverride(date);
                    }
                    if (dayTimeOverrides[date]) {
                      onRemoveTimeOverride(date);
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
