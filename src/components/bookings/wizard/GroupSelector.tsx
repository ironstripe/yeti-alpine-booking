import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, User, Calendar, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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

interface GroupSelectorProps {
  selectedDates: string[];
  sport: "ski" | "snowboard" | null;
  level: string | null;
  selectedGroupId: string | null;
  onGroupSelect: (groupId: string | null) => void;
}

interface GroupCourseWithCapacity {
  id: string;
  name: string;
  discipline: string;
  skill_level: string;
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
  selectedGroupId,
  onGroupSelect,
}: GroupSelectorProps) {
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
          skill_level,
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

  // Auto-select matching course based on skill level
  useEffect(() => {
    // Only auto-select if no group is currently selected
    if (selectedGroupId || filteredCourses.length === 0) return;
    
    // If no level provided, skip auto-select
    if (!level) return;
    
    const targetSkill = mapLevelToCourseSkill(level);
    
    // Find best matching course (matching skill level + has capacity)
    let matchingCourse = filteredCourses.find((course) => {
      const hasCapacity = course.currentCount < course.max_participants;
      const matchesLevel = course.skill_level === targetSkill;
      return hasCapacity && matchesLevel;
    });
    
    // Fallback: If no exact match, pick first course with capacity
    if (!matchingCourse) {
      matchingCourse = filteredCourses.find((course) => 
        course.currentCount < course.max_participants
      );
    }
    
    if (matchingCourse) {
      onGroupSelect(matchingCourse.id);
    }
  }, [filteredCourses, level, selectedGroupId, onGroupSelect]);

  // Get recommended skill for highlighting
  const recommendedSkill = useMemo(() => {
    return level ? mapLevelToCourseSkill(level) : null;
  }, [level]);

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
              const isFull = course.currentCount >= course.max_participants;
              const spotsLeft = course.max_participants - course.currentCount;
              const isRecommended = recommendedSkill && course.skill_level === recommendedSkill;

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
                      variant={isFull ? "destructive" : spotsLeft <= 3 ? "secondary" : "outline"}
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

      {/* Selected course details */}
      {selectedCourse && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            <span>
              {selectedCourse.skill_level} • {selectedCourse.discipline === "ski" ? "Ski" : "Snowboard"}
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
