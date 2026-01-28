import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInYears, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  Users,
  Sparkles,
  Copy,
  UtensilsCrossed,
  AlertTriangle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { mapLevelToCourseSkill, getLevelLabel } from "@/lib/level-utils";
import type { SelectedParticipant, ParticipantBookingDetails } from "@/contexts/BookingWizardContext";

interface ParticipantBookingCardProps {
  participant: SelectedParticipant;
  booking: ParticipantBookingDetails;
  onBookingChange: (booking: ParticipantBookingDetails) => void;
  onCopyToAll: () => void;
  isFirst: boolean;
  showDifferenceWarning: boolean;
}

const START_TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
const END_TIMES = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

const skillLevelLabels: Record<string, string> = {
  beginner: "Anfänger",
  intermediate: "Fortgeschritten",
  advanced: "Experte",
  unknown: "Unbekannt",
};

interface GroupCourseOption {
  id: string;
  name: string;
  skill_level: string;
  max_participants: number;
  currentCount: number;
  color: string | null;
  meeting_point: string | null;
  min_age: number | null;
  max_age: number | null;
}

export function ParticipantBookingCard({
  participant,
  booking,
  onBookingChange,
  onCopyToAll,
  isFirst,
  showDifferenceWarning,
}: ParticipantBookingCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  // Calculate participant age
  const age = useMemo(() => {
    if (!participant.birth_date) return null;
    return differenceInYears(new Date(), new Date(participant.birth_date));
  }, [participant.birth_date]);

  // Check if toddler (3-4 years) - restricted to windel-wedel
  const isToddler = age !== null && age >= 3 && age <= 4;

  // Check if adult (16+) - private only recommended
  const isAdult = age !== null && age >= 16;

  // Auto-navigate calendar to month of prefilled dates
  useEffect(() => {
    if (booking.dates.length > 0) {
      const firstDate = parseISO(booking.dates[0]);
      const currentMonthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const dateMonthStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
      
      if (currentMonthStart.getTime() !== dateMonthStart.getTime()) {
        setSelectedMonth(firstDate);
      }
    }
  }, [booking.dates.length]); // Only run when dates array length changes (initial load)

  // Fetch group courses with age in cache key
  const { data: groupCourses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["group-courses-for-booking-card", booking.dates, age],
    queryFn: async () => {
      if (booking.dates.length === 0) return [];

      const { data: coursesData, error } = await supabase
        .from("group_courses")
        .select(`
          id,
          name,
          skill_level,
          max_participants,
          color,
          meeting_point,
          course_type,
          min_age,
          max_age
        `)
        .eq("is_active", true);

      if (error) {
        console.error("Error fetching group courses:", error);
        throw error;
      }
      if (!coursesData || coursesData.length === 0) {
        return [];
      }

      // Get enrollment counts
      const courseIds = coursesData.map((c) => c.id);
      const { data: instances } = await supabase
        .from("group_course_instances")
        .select("course_id, current_participants")
        .in("course_id", courseIds)
        .in("date", booking.dates);

      const enrollmentMap: Record<string, number> = {};
      instances?.forEach((inst) => {
        enrollmentMap[inst.course_id] = Math.max(
          enrollmentMap[inst.course_id] || 0,
          inst.current_participants || 0
        );
      });

      // Map all courses - no age filtering (age is a soft warning only)
      return coursesData.map((course) => ({
        ...course,
        currentCount: enrollmentMap[course.id] || 0,
      })) as GroupCourseOption[];
    },
    enabled: booking.dates.length > 0 && booking.productType === "group",
  });

  // Get recommended course based on participant's level (age already filtered in query)
  const recommendedCourseId = useMemo(() => {
    if (groupCourses.length === 0) return null;
    
    const targetSkill = mapLevelToCourseSkill(participant.level_current_season);
    
    // First try: exact skill match with capacity
    let match = groupCourses.find(
      (c) => c.skill_level === targetSkill && c.currentCount < c.max_participants
    );
    
    // Fallback: if no exact skill match, pick first age-appropriate course with capacity
    if (!match) {
      match = groupCourses.find((c) => c.currentCount < c.max_participants);
    }
    
    return match?.id || null;
  }, [participant.level_current_season, groupCourses]);

  // Auto-select group if none selected and we have a recommendation
  useEffect(() => {
    if (
      booking.productType === "group" &&
      !booking.groupCourseId &&
      recommendedCourseId
    ) {
      onBookingChange({ ...booking, groupCourseId: recommendedCourseId });
    }
  }, [booking.productType, booking.groupCourseId, recommendedCourseId]);

  // Calculate available end times based on start time
  const availableEndTimes = useMemo(() => {
    if (!booking.startTime) return END_TIMES;
    const startHour = parseInt(booking.startTime.split(":")[0]);
    return END_TIMES.filter((time) => parseInt(time.split(":")[0]) > startHour);
  }, [booking.startTime]);

  // Calculate duration
  const duration = useMemo(() => {
    if (!booking.startTime || !booking.endTime) return null;
    const startHour = parseInt(booking.startTime.split(":")[0]);
    const endHour = parseInt(booking.endTime.split(":")[0]);
    return endHour - startHour;
  }, [booking.startTime, booking.endTime]);

  const handleDateSelect = (dates: Date[] | undefined) => {
    if (dates) {
      const dateStrings = dates.map((d) => format(d, "yyyy-MM-dd"));
      onBookingChange({ ...booking, dates: dateStrings });
    }
  };

  const handleProductTypeChange = (type: "private" | "group") => {
    onBookingChange({
      ...booking,
      productType: type,
      groupCourseId: null,
      startTime: type === "group" ? "10:00" : booking.startTime,
      endTime: type === "group" ? "12:00" : booking.endTime,
    });
  };

  const handleLunchDayToggle = (dateStr: string) => {
    const newLunchDays = booking.lunchDays.includes(dateStr)
      ? booking.lunchDays.filter((d) => d !== dateStr)
      : [...booking.lunchDays, dateStr];
    onBookingChange({ ...booking, lunchDays: newLunchDays });
  };

  return (
    <Card className={cn(showDifferenceWarning && "border-amber-300 bg-amber-50/30")}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="p-3">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                  {participant.first_name?.[0]?.toUpperCase()}
                </div>

                {/* Name & badges */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {participant.first_name} {participant.last_name}
                    </span>
                    {age !== null && (
                      <Badge variant="outline" className="text-xs">
                        {age} J.
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1 mt-0.5">
                    {participant.level_current_season && (
                      <Badge variant="secondary" className="text-xs">
                        {getLevelLabel(participant.level_current_season)}
                      </Badge>
                    )}
                    {participant.sport && (
                      <Badge variant="secondary" className="text-xs">
                        {participant.sport === "ski" ? "⛷️ Ski" : "🏂 Snowboard"}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {showDifferenceWarning && (
                  <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Abweichend
                  </Badge>
                )}
                {/* Summary when collapsed */}
                {!isOpen && booking.dates.length > 0 && (
                  <div className="text-sm text-muted-foreground hidden sm:block">
                    {booking.productType === "group" ? "Gruppenkurs" : "Privat"} • {booking.dates.length} Tag(e)
                  </div>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-3 pt-0 space-y-4">
            {/* Product Type */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">
                Buchungstyp
              </Label>
              <RadioGroup
                value={booking.productType}
                onValueChange={(v) => handleProductTypeChange(v as "private" | "group")}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor={`private-${participant.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border-2 p-3 text-sm",
                    booking.productType === "private"
                      ? "border-primary bg-primary/5"
                      : "border-muted"
                  )}
                >
                  <RadioGroupItem
                    value="private"
                    id={`private-${participant.id}`}
                    className="sr-only"
                  />
                  <span>👤 Privatstunde</span>
                  {isAdult && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-400">
                      Empfohlen
                    </Badge>
                  )}
                </Label>
                <Label
                  htmlFor={`group-${participant.id}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border-2 p-3 text-sm",
                    booking.productType === "group"
                      ? "border-primary bg-primary/5"
                      : "border-muted",
                    isAdult && "opacity-60"
                  )}
                >
                  <RadioGroupItem
                    value="group"
                    id={`group-${participant.id}`}
                    className="sr-only"
                    disabled={isAdult}
                  />
                  <span>👥 Gruppenkurs</span>
                </Label>
              </RadioGroup>
              {isAdult && booking.productType !== "private" && (
                <p className="text-xs text-amber-600">
                  Erwachsene buchen normalerweise Privatstunden
                </p>
              )}
            </div>

            {/* Group Course Selector */}
            {booking.productType === "group" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Gruppe
                </Label>
                
                {coursesLoading ? (
                  <div className="text-xs text-muted-foreground py-2">Gruppen laden...</div>
                ) : groupCourses.length === 0 ? (
                  <div className="text-xs text-amber-600 py-2 bg-amber-50 rounded-md px-2">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    Keine Gruppen verfügbar. Bitte wählen Sie zuerst Kurstage.
                  </div>
                ) : (
                  <Select
                    value={booking.groupCourseId || ""}
                    onValueChange={(v) =>
                      onBookingChange({ ...booking, groupCourseId: v || null })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Gruppe wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupCourses.map((course) => {
                        const isFull = course.currentCount >= course.max_participants;
                        const isRecommended = course.id === recommendedCourseId;
                        const isAgeWarning = age !== null && course.max_age != null && age > course.max_age;
                        return (
                          <SelectItem
                            key={course.id}
                            value={course.id}
                            disabled={isFull}
                            className={cn(isFull && "opacity-50")}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: course.color || "#6b7280" }}
                              />
                              <span>{course.name}</span>
                              {isRecommended && !isFull && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-4 px-1 border-green-400 text-green-600"
                                >
                                  <Sparkles className="h-2 w-2 mr-0.5" />
                                  Empfohlen
                                </Badge>
                              )}
                              {isAgeWarning && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-4 px-1 border-amber-400 text-amber-600"
                                >
                                  <AlertTriangle className="h-2 w-2 mr-0.5" />
                                  &gt;{course.max_age}J
                                </Badge>
                              )}
                              <Badge
                                variant={isFull ? "destructive" : "outline"}
                                className="text-[10px] h-4 px-1"
                              >
                                {course.currentCount}/{course.max_participants}
                              </Badge>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                {/* Show auto-matched info */}
                {booking.groupCourseId === recommendedCourseId && recommendedCourseId && (
                  <div className="flex items-center gap-1 text-xs text-green-600 mt-1">
                    <Sparkles className="h-3 w-3" />
                    <span>Automatisch passend zum Niveau "{getLevelLabel(participant.level_current_season)}" zugewiesen</span>
                  </div>
                )}
              </div>
            )}

            {/* Time Selection (Private only) */}
            {booking.productType === "private" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Zeitfenster
                </Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={booking.startTime || ""}
                    onValueChange={(v) =>
                      onBookingChange({
                        ...booking,
                        startTime: v,
                        endTime:
                          booking.endTime &&
                          parseInt(v.split(":")[0]) >= parseInt(booking.endTime.split(":")[0])
                            ? null
                            : booking.endTime,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="Start" />
                    </SelectTrigger>
                    <SelectContent>
                      {START_TIMES.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">–</span>
                  <Select
                    value={booking.endTime || ""}
                    onValueChange={(v) => onBookingChange({ ...booking, endTime: v })}
                    disabled={!booking.startTime}
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="Ende" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEndTimes.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {duration && (
                    <Badge variant="secondary" className="text-xs">
                      {duration}h
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Date Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Kurstage
              </Label>
              <CalendarComponent
                mode="multiple"
                selected={booking.dates.map((d) => parseISO(d))}
                onSelect={handleDateSelect}
                month={selectedMonth}
                onMonthChange={setSelectedMonth}
                locale={de}
                className="rounded-md border pointer-events-auto"
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              />
              {booking.dates.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {booking.dates.sort().map((date) => (
                    <Badge key={date} variant="secondary" className="text-xs">
                      {format(parseISO(date), "EEE, d. MMM", { locale: de })}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Lunch Options (Group only) */}
            {booking.productType === "group" && booking.dates.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                  <UtensilsCrossed className="h-3 w-3" />
                  Mittagsbetreuung
                </Label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {booking.dates.sort().map((dateStr) => (
                      <label
                        key={dateStr}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1 rounded border cursor-pointer text-xs",
                          booking.lunchDays.includes(dateStr)
                            ? "border-primary bg-primary/10"
                            : "border-muted"
                        )}
                      >
                        <Checkbox
                          checked={booking.lunchDays.includes(dateStr)}
                          onCheckedChange={() => handleLunchDayToggle(dateStr)}
                        />
                        {format(parseISO(dateStr), "EEE", { locale: de })}
                      </label>
                    ))}
                  </div>
                  {booking.lunchDays.length > 0 && (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={booking.isVegetarian}
                        onCheckedChange={(c) =>
                          onBookingChange({ ...booking, isVegetarian: c === true })
                        }
                      />
                      <span>🥬 Vegetarisch</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Copy to all button */}
            {!isFirst && (
              <div className="pt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCopyToAll}
                  className="text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Wie erster Teilnehmer
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
