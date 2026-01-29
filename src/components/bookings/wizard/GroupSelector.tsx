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

interface Participant {
  id: string;
  first_name: string;
  last_name?: string | null;
  level_current_season: string | null;
  // New training-based level fields
  current_ski_training_id?: string | null;
  current_snowboard_training_id?: string | null;
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
  max_participants: number;
  color: string | null;
  meeting_point: string | null;
  course_type: string | null;
  next_training_id: string | null;
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
  // Get participant's current training ID based on sport
  const getParticipantTrainingId = (participant: Participant): string | null => {
    if (sport === 'ski') {
      return participant.current_ski_training_id || null;
    } else if (sport === 'snowboard') {
      return participant.current_snowboard_training_id || null;
    }
    return null;
  };

  // Use first participant's training ID for recommendations
  const primaryTrainingId = participants.length > 0 
    ? getParticipantTrainingId(participants[0])
    : null;

  // Check if participants have different training levels
  const trainingMismatch = useMemo(() => {
    if (participants.length < 2) return false;
    const trainingIds = participants.map(p => getParticipantTrainingId(p));
    const unique = new Set(trainingIds.filter(Boolean));
    return unique.size > 1;
  }, [participants, sport]);

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
          max_participants,
          color,
          meeting_point,
          course_type,
          next_training_id,
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
      if (sport && c.discipline && c.discipline !== sport && c.discipline !== 'both') return false;
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

  // Find the recommended course: the NEXT training in progression
  // If participant has training_id, find the course that comes after it
  const recommendedCourseId = useMemo(() => {
    if (!primaryTrainingId) return null;
    
    // Find a course that has this training as its "previous" training
    // i.e., find a course where another course's next_training_id points to it
    // OR find the course itself if participant is at this level
    
    // First, check if participant's current training has a next_training_id
    const currentTraining = filteredCourses.find(c => c.id === primaryTrainingId);
    if (currentTraining?.next_training_id) {
      // Recommend the next training in progression
      return currentTraining.next_training_id;
    }
    
    // If no next training, recommend current level
    return primaryTrainingId;
  }, [primaryTrainingId, filteredCourses]);

  // Auto-select matching course based on training progression
  useEffect(() => {
    // Only auto-select if no group is currently selected
    if (selectedGroupId || filteredCourses.length === 0) return;
    
    const spotsNeeded = Math.max(participants.length, 1);
    
    // Try to select recommended course first
    if (recommendedCourseId) {
      const recommendedCourse = filteredCourses.find(c => c.id === recommendedCourseId);
      if (recommendedCourse) {
        const spotsAvailable = recommendedCourse.max_participants - recommendedCourse.currentCount;
        if (spotsAvailable >= spotsNeeded) {
          onGroupSelect(recommendedCourse.id);
          return;
        }
      }
    }
    
    // Fallback: If no recommended course or it's full, pick first course with capacity
    const fallbackCourse = filteredCourses.find((course) => {
      const spotsAvailable = course.max_participants - course.currentCount;
      return spotsAvailable >= spotsNeeded;
    });
    
    if (fallbackCourse) {
      onGroupSelect(fallbackCourse.id);
    }
  }, [filteredCourses, recommendedCourseId, selectedGroupId, onGroupSelect, participants.length]);

  // Find mismatched participants for the selected course
  const mismatchedParticipants = useMemo(() => {
    if (!selectedCourse || participants.length === 0) return [];
    
    return participants.filter(p => {
      const participantTrainingId = getParticipantTrainingId(p);
      if (!participantTrainingId) return false;
      
      // Check if this course is appropriate for the participant
      // Course is appropriate if:
      // 1. It matches participant's current training
      // 2. It's the next training in progression
      const isCurrentTraining = participantTrainingId === selectedCourse.id;
      const isNextTraining = filteredCourses.find(c => 
        c.id === participantTrainingId && c.next_training_id === selectedCourse.id
      );
      
      return !isCurrentTraining && !isNextTraining;
    });
  }, [selectedCourse, participants, filteredCourses, sport]);

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

      {/* Training level mismatch warning */}
      {trainingMismatch && participants.length > 1 && (
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
              const isRecommended = recommendedCourseId === course.id;

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
              {selectedCourse.discipline === "ski" ? "Ski" : 
               selectedCourse.discipline === "snowboard" ? "Snowboard" : 
               "Ski & Snowboard"}
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
