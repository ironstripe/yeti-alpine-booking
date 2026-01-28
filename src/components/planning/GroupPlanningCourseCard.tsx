import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, XCircle, Loader2, Clock, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useBulkAssignInstructor } from '@/hooks/useGroupCourses';
import type { GroupPlanningCourse } from '@/hooks/useGroupPlanningData';
import type { Instructor } from '@/hooks/useInstructors';
import { DAYS_OF_WEEK } from '@/types/group-courses';

interface GroupPlanningCourseCardProps {
  course: GroupPlanningCourse;
  weekStart: Date;
  instructors: Instructor[];
  onDetailsClick: () => void;
}

function AssignmentStatusBadge({ course }: { course: GroupPlanningCourse }) {
  if (course.totalInstances === 0) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Keine Instanzen
      </Badge>
    );
  }

  if (course.isFullyAssigned) {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
        <CheckCircle className="h-3 w-3 mr-1" />
        Zugewiesen
      </Badge>
    );
  }

  if (course.assignedInstances > 0) {
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
        <AlertCircle className="h-3 w-3 mr-1" />
        Teilweise
      </Badge>
    );
  }

  return (
    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
      <XCircle className="h-3 w-3 mr-1" />
      Offen
    </Badge>
  );
}

function getScheduleSummary(schedules: GroupPlanningCourse['schedules']): string {
  if (schedules.length === 0) return 'Kein Zeitplan';

  const days = [...new Set(schedules.map(s => s.dayOfWeek))].sort();
  const times = schedules[0];

  // Get day abbreviations
  const dayLabels = days.map(d => DAYS_OF_WEEK.find(dw => dw.value === d)?.label || '?');
  
  // Check if consecutive days
  let dayString = '';
  if (days.length > 1 && days.every((d, i) => i === 0 || d === days[i - 1] + 1)) {
    dayString = `${dayLabels[0]}-${dayLabels[dayLabels.length - 1]}`;
  } else {
    dayString = dayLabels.join(', ');
  }

  return `${dayString} ${times?.startTime?.slice(0, 5) || ''}-${times?.endTime?.slice(0, 5) || ''}`;
}

export function GroupPlanningCourseCard({
  course,
  weekStart,
  instructors,
  onDetailsClick,
}: GroupPlanningCourseCardProps) {
  const [selectedInstructor, setSelectedInstructor] = useState<string>(course.weeklyInstructorId || '');
  const [selectedAssistant, setSelectedAssistant] = useState<string>(course.weeklyAssistantId || '');

  const bulkAssign = useBulkAssignInstructor();

  // Sync local state when course data changes
  useEffect(() => {
    setSelectedInstructor(course.weeklyInstructorId || '');
    setSelectedAssistant(course.weeklyAssistantId || '');
  }, [course.weeklyInstructorId, course.weeklyAssistantId]);

  const handleAssign = () => {
    if (!selectedInstructor) return;

    bulkAssign.mutate({
      courseId: course.id,
      weekStart,
      instructorId: selectedInstructor,
      assistantInstructorId: selectedAssistant || null,
    });
  };

  const participantPercentage = course.maxParticipants > 0
    ? Math.round((course.totalParticipants / (course.maxParticipants * course.totalInstances || 1)) * 100)
    : 0;

  const disciplineLabel = course.discipline === 'both' ? 'Ski & Snowboard' : course.discipline === 'ski' ? 'Ski' : 'Snowboard';

  return (
    <Card className={cn(
      "overflow-hidden transition-shadow hover:shadow-md",
      !course.isFullyAssigned && course.totalInstances > 0 && "border-amber-300"
    )}>
      {/* Color bar */}
      <div className="h-2" style={{ backgroundColor: course.color }} />
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-base leading-tight">{course.name}</h3>
          <AssignmentStatusBadge course={course} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          <Badge variant="outline" className="text-xs">{course.skillLevelName}</Badge>
          <Badge variant="outline" className="text-xs">{disciplineLabel}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Schedule and participants info */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>{getScheduleSummary(course.schedules)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span>{course.totalParticipants} TN</span>
          </div>
        </div>

        {course.totalInstances > 0 && (
          <Progress value={participantPercentage} className="h-1.5" />
        )}

        {/* Instructor selects */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Lehrer</Label>
            <Select value={selectedInstructor} onValueChange={setSelectedInstructor}>
              <SelectTrigger className={cn(
                "h-9",
                !selectedInstructor && course.totalInstances > 0 && "border-destructive"
              )}>
                <SelectValue placeholder="Lehrer wählen..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {instructors.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.first_name} {i.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Hilfskraft</Label>
            <Select value={selectedAssistant} onValueChange={setSelectedAssistant}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="(keine)" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="">Keine</SelectItem>
                {instructors
                  .filter(i => i.id !== selectedInstructor)
                  .map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.first_name} {i.last_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleAssign}
            disabled={!selectedInstructor || bulkAssign.isPending || course.totalInstances === 0}
            className="flex-1"
            size="sm"
          >
            {bulkAssign.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Zuweisen
          </Button>
          <Button 
            variant="outline" 
            onClick={onDetailsClick}
            size="sm"
            disabled={course.totalInstances === 0}
          >
            Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
