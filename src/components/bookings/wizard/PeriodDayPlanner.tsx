import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar, AlertTriangle, Plus, Trash2 } from "lucide-react";

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
  onTimeChange: (date: string, startTime: string, endTime: string, instructorId?: string | null) => void;
  onAddTimeBlock: (date: string, startTime: string, endTime: string, instructorId?: string | null) => void;
  onUpdateTimeBlock: (date: string, blockId: string, startTime: string, endTime: string, instructorId?: string | null) => void;
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
      const timeBlocks = dayTimeOverrides[date] || [];
      // Check if any block has override from base
      const hasBlockOverrides = timeBlocks.some(block => 
        block.startTime !== baseStartTime ||
        block.endTime !== baseEndTime ||
        (block.instructorId && block.instructorId !== baseInstructor?.id)
      );
      const hasMultipleBlocks = timeBlocks.length > 1;
      const hasTimeOverride = timeBlocks.length > 0 && hasBlockOverrides;
      const hasDayInstructorOverride = dayInstructorOverrides[date] && 
        dayInstructorOverrides[date] !== baseInstructor?.id;
      return hasTimeOverride || hasMultipleBlocks || hasDayInstructorOverride;
    }).length;
  }, [sortedDates, dayInstructorOverrides, dayTimeOverrides, baseInstructor, baseStartTime, baseEndTime]);

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getInstructorById = (id: string | null | undefined) => {
    if (!id) return null;
    return availableInstructors.find((i) => i.id === id) || null;
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

  // Get instructor for a specific block
  const getBlockInstructor = (date: string, block: TimeBlock): Tables<"instructors"> | null => {
    // Priority: block-level > day-level > base
    if (block.instructorId) {
      return getInstructorById(block.instructorId);
    }
    const dayOverride = dayInstructorOverrides[date];
    if (dayOverride !== undefined) {
      return getInstructorById(dayOverride);
    }
    return baseInstructor;
  };

  // Check if a block has any overrides from base
  const isBlockOverridden = (date: string, block: TimeBlock, blockIndex: number) => {
    const blockInstructor = getBlockInstructor(date, block);
    const hasTimeOverride = block.startTime !== baseStartTime || block.endTime !== baseEndTime;
    const hasInstructorOverride = blockInstructor?.id !== baseInstructor?.id;
    const isAdditionalBlock = blockIndex > 0;
    return { hasTimeOverride, hasInstructorOverride, isAdditionalBlock };
  };

  // Check if day has any overrides from base
  const isDayOverridden = (date: string) => {
    const timeBlocks = getDayTimeBlocks(date);
    return timeBlocks.some((block, idx) => {
      const { hasTimeOverride, hasInstructorOverride, isAdditionalBlock } = isBlockOverridden(date, block, idx);
      return hasTimeOverride || hasInstructorOverride || isAdditionalBlock;
    });
  };

  // Generate available end times based on start time
  const getAvailableEndTimes = (startTime: string) => {
    const startHour = parseInt(startTime.split(":")[0]);
    return TIME_OPTIONS.filter((time) => {
      const hour = parseInt(time.split(":")[0]);
      return hour > startHour && hour <= 16;
    });
  };

  // Handle instructor change for a block
  const handleBlockInstructorChange = (date: string, block: TimeBlock, newInstructorId: string | null) => {
    if (block.id === "base") {
      // For base block (no overrides yet), create an override
      onTimeChange(date, block.startTime, block.endTime, newInstructorId);
    } else {
      // Update existing block
      onUpdateTimeBlock(date, block.id, block.startTime, block.endTime, newInstructorId);
    }
  };

  // Handle time change for a block
  const handleBlockTimeChange = (
    date: string,
    block: TimeBlock,
    newStartTime: string,
    newEndTime: string
  ) => {
    const blockInstructor = block.instructorId;
    if (block.id === "base") {
      onTimeChange(date, newStartTime, newEndTime, blockInstructor);
    } else {
      onUpdateTimeBlock(date, block.id, newStartTime, newEndTime, blockInstructor);
    }
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
          <CardContent className="pt-0 space-y-4">
            {/* Default info */}
            <div className="p-3 rounded-lg bg-muted/50 border border-muted">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Standard:</span>{" "}
                {baseInstructor ? `${baseInstructor.first_name} ${baseInstructor.last_name}` : "Nicht zugewiesen"},{" "}
                {baseStartTime} - {baseEndTime}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Diese Einstellungen gelten für alle Tage, sofern nicht überschrieben.
              </p>
            </div>
            
            {/* Day cards */}
            {sortedDates.map((date) => {
              const timeBlocks = getDayTimeBlocks(date);
              const isOverridden = isDayOverridden(date);

              return (
                <div
                  key={date}
                  className={`rounded-lg border transition-colors ${
                    isOverridden 
                      ? "border-amber-300 bg-amber-50/50" 
                      : "border-muted bg-muted/30"
                  }`}
                >
                  {/* Date Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-muted/50">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {format(parseISO(date), "EEEE, d. MMM", { locale: de })}
                      </span>
                    </div>
                    {isOverridden && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Angepasst
                      </Badge>
                    )}
                  </div>
                  
                  {/* Time Blocks */}
                  <div className="p-4 space-y-4">
                    {timeBlocks.map((block, blockIndex) => {
                      const blockInstructor = getBlockInstructor(date, block);
                      const { hasTimeOverride, hasInstructorOverride, isAdditionalBlock } = isBlockOverridden(date, block, blockIndex);
                      const statusConfig = blockInstructor ? getStatusConfig(blockInstructor.real_time_status) : null;

                      return (
                        <div key={block.id} className="space-y-2">
                          {/* Block Label */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              Zeitblock {blockIndex + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              {isAdditionalBlock && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-secondary text-secondary-foreground border-border">
                                  Zusätzlicher Block
                                </Badge>
                              )}
                              {(hasTimeOverride || hasInstructorOverride) && !isAdditionalBlock && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-600 border-amber-200">
                                  Abweichend
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Time Selection */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-6">🕐</span>
                            <Select
                              value={block.startTime}
                              onValueChange={(value) => {
                                const newEndHour = parseInt(value.split(":")[0]) + 2;
                                const newEnd = newEndHour <= 16 
                                  ? `${newEndHour.toString().padStart(2, "0")}:00`
                                  : block.endTime;
                                handleBlockTimeChange(date, block, value, newEnd);
                              }}
                            >
                              <SelectTrigger className="w-24 h-8 text-xs">
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
                            <span className="text-xs text-muted-foreground">bis</span>
                            <Select
                              value={block.endTime}
                              onValueChange={(value) => {
                                handleBlockTimeChange(date, block, block.startTime, value);
                              }}
                            >
                              <SelectTrigger className="w-24 h-8 text-xs">
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
                            {hasTimeOverride && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-600 border-amber-200">
                                ⚠️
                              </Badge>
                            )}
                          </div>

                          {/* Instructor Selection */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-6">👤</span>
                            <Select
                              value={blockInstructor?.id || "none"}
                              onValueChange={(value) => {
                                if (value === "none") {
                                  handleBlockInstructorChange(date, block, null);
                                } else if (value === baseInstructor?.id && !block.instructorId && !dayInstructorOverrides[date]) {
                                  // Selecting base instructor when already at default - no change needed
                                } else {
                                  handleBlockInstructorChange(date, block, value);
                                }
                              }}
                            >
                              <SelectTrigger className="flex-1 h-8 text-xs">
                                <SelectValue>
                                  {blockInstructor ? (
                                    <div className="flex items-center gap-2">
                                      <div className="relative">
                                        <Avatar className="h-5 w-5">
                                          <AvatarFallback className="text-[10px]">
                                            {getInitials(blockInstructor.first_name, blockInstructor.last_name)}
                                          </AvatarFallback>
                                        </Avatar>
                                        {statusConfig && (
                                          <div
                                            className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${statusConfig.color}`}
                                          />
                                        )}
                                      </div>
                                      <span className="truncate">
                                        {blockInstructor.first_name} {blockInstructor.last_name}
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
                            {hasInstructorOverride && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-600 border-amber-200">
                                ⚠️
                              </Badge>
                            )}
                          </div>

                          {/* Remove Block Button */}
                          {(timeBlocks.length > 1 || block.id !== "base") && (
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  if (block.id === "base") {
                                    onRemoveTimeOverride(date);
                                  } else {
                                    onRemoveTimeBlock(date, block.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Zeitblock entfernen
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Add Time Block Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs border-dashed"
                      onClick={() => {
                        const lastBlock = timeBlocks[timeBlocks.length - 1];
                        const lastEndHour = parseInt(lastBlock.endTime.split(":")[0]);
                        const newStart = lastEndHour < 14 ? `${(lastEndHour + 1).toString().padStart(2, "0")}:00` : "14:00";
                        const newEnd = Math.min(parseInt(newStart.split(":")[0]) + 2, 16).toString().padStart(2, "0") + ":00";
                        onAddTimeBlock(date, newStart, newEnd, undefined);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Weiterer Zeitblock hinzufügen
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
