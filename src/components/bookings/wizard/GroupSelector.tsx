import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, User, Calendar, Sparkles, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { mapLevelToCourseSkill } from "@/lib/level-utils";
import type { Tables } from "@/integrations/supabase/types";

interface Participant {
  id: string;
  first_name: string;
  last_name?: string | null;
  level_current_season: string | null;
}

interface GroupSelectorProps {
  selectedDates: string[];
  sport: "ski" | "snowboard" | null;
  /** @deprecated Use participants instead */
  level?: string | null;
  participants?: Participant[];
  selectedGroupId: string | null;
  onGroupSelect: (groupId: string | null) => void;
}

interface GroupCourseWithCapacity {
  id: string;
  name: string;
  discipline: string;
  skill_level_id: string;
  max_participants: number;
  color: string | null;
  meeting_point: string | null;
  course_type: string | null;
  currentCount: number;
  schedules: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
  }>;
}

export function GroupSelector({
  selectedDates,
  sport,
  level,
  participants = [],
  selectedGroupId,
  onGroupSelect,
}: GroupSelectorProps) {
  // Use first participant's level as fallback for backwards compatibility
  const primaryLevel = participants.length > 0 
    ? participants[0].level_current_season 
    : level;

  // Check if participants have different levels
  const levelMismatch = useMemo(() => {
    if (participants.length < 2) return false;
    const levels = participants.map(p => mapLevelToCourseSkill(p.level_current_season));
    const unique = new Set(levels);
    return unique.size > 1;
  }, [participants]);

  // Fetch active group courses with their schedules
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["group-courses-for-booking", selectedDates, sport],
    queryFn: async () => {
      if (selectedDates.length === 0) return [];

      // Fetch active group courses
      const { data: coursesData, error } = await supabase
        .from("group_courses")
        .select(`
          id,
          name,
          discipline,
          skill_level_id,
          max_participants,
          color,
          meeting_point,
          course_type,
          schedules:group_course_schedules(day_of_week, start_time, end_time)
        `)
        .eq("is_active", true);

      if (error) throw error;
      if (!coursesData) return [];

      // Get day of week for selected dates (0 = Sunday, 6 = Saturday)
      const selectedDaysOfWeek = selectedDates.map(dateStr => {
        const date = new Date(dateStr);
        return date.getDay();
      });

      // Filter courses that have schedules matching selected days
      const matchingCourses = coursesData.filter(course => {
        // For Saturday courses, check if any selected date is Saturday (6)
        if (course.course_type === "saturday_course") {
          return selectedDaysOfWeek.includes(6);
        }
        
        // For weekly courses, check schedules
        if (!course.schedules || course.schedules.length === 0) return true; // Show if no schedules defined
        
        return course.schedules.some(schedule => 
          selectedDaysOfWeek.includes(schedule.day_of_week)
        );
      });

      // Get instance counts for capacity
      const courseIds = matchingCourses.map(c => c.id);
      const { data: instances } = await supabase
        .from("group_course_instances")
        .select("course_id, current_participants")
        .in("course_id", courseIds)
        .in("date", selectedDates);

      // Calculate current enrollment per course
      const enrollmentMap: Record<string, number> = {};
      instances?.forEach(inst => {
        if (!enrollmentMap[inst.course_id]) {
          enrollmentMap[inst.course_id] = 0;
        }
        enrollmentMap[inst.course_id] = Math.max(
          enrollmentMap[inst.course_id],
          inst.current_participants || 0
        );
      });

      return matchingCourses.map(course => ({
        ...course,
        currentCount: enrollmentMap[course.id] || 0,
      })) as GroupCourseWithCapacity[];
    },
    enabled: selectedDates.length > 0,
  });

  // Filter by discipline if sport is specified
  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      if (sport && c.discipline && c.discipline !== sport) return false;
      return true;
    });
  }, [courses, sport]);

  const selectedCourse = useMemo(() => {
    return filteredCourses.find(c => c.id === selectedGroupId);
  }, [filteredCourses, selectedGroupId]);

  // Check capacity for multiple participants
  const insufficientCapacity = useMemo(() => {
    if (!selectedCourse || participants.length === 0) return false;
    const spotsNeeded = participants.length;
    const spotsAvailable = selectedCourse.max_participants - selectedCourse.currentCount;
    return spotsAvailable < spotsNeeded;
  }, [selectedCourse, participants.length]);

  // Auto-select matching course based on skill level
  useEffect(() => {
    // Only auto-select if no group is currently selected
    if (selectedGroupId || filteredCourses.length === 0) return;
    
    // If no level provided, skip auto-select
    if (!primaryLevel) return;
    
    const targetSkill = mapLevelToCourseSkill(primaryLevel);
    
    // Find best matching course using skill level comparison
    const spotsNeeded = Math.max(participants.length, 1);
    let matchingCourse = filteredCourses.find((course) => {
      const spotsAvailable = course.max_participants - course.currentCount;
      const hasCapacity = spotsAvailable >= spotsNeeded;
      // Use legacy mapping for now since we're matching participant level strings
      const matchesLevel = mapLevelToCourseSkill(course.skill_level_id) === targetSkill;
      return hasCapacity && matchesLevel;
    });
    
    // Fallback: If no exact match, pick first course with capacity
    if (!matchingCourse) {
      matchingCourse = filteredCourses.find((course) => {
        const spotsAvailable = course.max_participants - course.currentCount;
        return spotsAvailable >= spotsNeeded;
      });
    }
    
    if (matchingCourse) {
      onGroupSelect(matchingCourse.id);
    }
  }, [filteredCourses, primaryLevel, selectedGroupId, onGroupSelect, participants.length]);

  // Get recommended skill for highlighting
  const recommendedSkill = useMemo(() => {
    return primaryLevel ? mapLevelToCourseSkill(primaryLevel) : null;
  }, [primaryLevel]);

  // Find mismatched participants for the selected course
  const mismatchedParticipants = useMemo(() => {
    if (!selectedCourse || participants.length === 0) return [];
    const courseSkill = mapLevelToCourseSkill(selectedCourse.skill_level_id);
    
    return participants.filter(p => {
      const participantSkill = mapLevelToCourseSkill(p.level_current_season);
      return participantSkill !== courseSkill;
    });
  }, [selectedCourse, participants]);

  if (selectedDates.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Wählen Sie zuerst Kurstage
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Users className="h-3 w-3" />
        Gruppe auswählen
      </Label>

      {/* Level mismatch warning */}
      {levelMismatch && participants.length > 1 && (
        <Alert className="bg-amber-50 border-amber-200 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-xs text-amber-700">
            Teilnehmer haben unterschiedliche Niveaus. Alle werden in dieselbe Gruppe eingeschrieben.
          </AlertDescription>
        </Alert>
      )}

      <Select
        value={selectedGroupId || ""}
        onValueChange={(value) => onGroupSelect(value || null)}
        disabled={isLoading}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder={isLoading ? "Laden..." : "Gruppe wählen"} />
        </SelectTrigger>
        <SelectContent>
          {filteredCourses.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              Keine passenden Gruppen gefunden
            </div>
          ) : (
            filteredCourses.map((course) => {
              const spotsNeeded = Math.max(participants.length, 1);
              const spotsAvailable = course.max_participants - course.currentCount;
              const isFull = spotsAvailable < spotsNeeded;
              const courseSkill = mapLevelToCourseSkill(course.skill_level_id);
              const isRecommended = recommendedSkill && courseSkill === recommendedSkill;

              return (
                <SelectItem
                  key={course.id}
                  value={course.id}
                  disabled={isFull}
                  className={cn(isFull && "opacity-50")}
                >
                  <div className="flex items-center gap-2 w-full">
                    {/* Color indicator */}
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: course.color || "#6b7280" }}
                    />
                    <span className="flex-1 truncate">{course.name}</span>
                    {isRecommended && !isFull && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 px-1.5 border-green-400 text-green-600 bg-green-50"
                      >
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                        Empfohlen
                      </Badge>
                    )}
                    <Badge
                      variant={isFull ? "destructive" : spotsAvailable <= 3 ? "secondary" : "outline"}
                      className="text-[10px] h-5 px-1.5"
                    >
                      {course.currentCount}/{course.max_participants}
                    </Badge>
                  </div>
                </SelectItem>
              );
            })
          )}
        </SelectContent>
      </Select>

      {/* Insufficient capacity warning */}
      {insufficientCapacity && selectedCourse && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Nicht genügend Plätze! Benötigt: {participants.length}, 
            Verfügbar: {selectedCourse.max_participants - selectedCourse.currentCount}
          </AlertDescription>
        </Alert>
      )}

      {/* Participant mismatch warning */}
      {mismatchedParticipants.length > 0 && selectedCourse && !insufficientCapacity && (
        <Alert className="bg-orange-50 border-orange-200 py-2">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-xs text-orange-700">
            {mismatchedParticipants.map(p => p.first_name).join(", ")} passt/passen 
            nicht zum Kursniveau.
          </AlertDescription>
        </Alert>
      )}

      {/* Selected course details */}
      {selectedCourse && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            <span>
              {selectedCourse.discipline === "ski" ? "Ski" : "Snowboard"}
            </span>
          </div>
          {selectedCourse.meeting_point && (
            <div className="flex items-center gap-2">
              <User className="h-3 w-3" />
              <span>Treffpunkt: {selectedCourse.meeting_point}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
