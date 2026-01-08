import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  Edit, 
  List,
  Snowflake
} from 'lucide-react';
import type { GroupCourseWithSchedules } from '@/types/group-courses';
import { SKILL_LEVELS, DISCIPLINES, DAYS_OF_WEEK } from '@/types/group-courses';

interface TrainingCardProps {
  course: GroupCourseWithSchedules;
  onEdit: (course: GroupCourseWithSchedules) => void;
  onViewInstances: (course: GroupCourseWithSchedules) => void;
}

export function TrainingCard({ course, onEdit, onViewInstances }: TrainingCardProps) {
  const skillLabel = SKILL_LEVELS.find(s => s.value === course.skill_level)?.label || course.skill_level;
  const disciplineLabel = DISCIPLINES.find(d => d.value === course.discipline)?.label || course.discipline;

  // Get unique days from schedules
  const scheduleDays = [...new Set(course.schedules.map(s => s.day_of_week))].sort();
  const dayLabels = scheduleDays.map(d => DAYS_OF_WEEK.find(dw => dw.value === d)?.label).filter(Boolean);

  // Get unique time slots
  const timeSlots = [...new Set(course.schedules.map(s => `${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`))];

  // Age range text
  const ageRange = course.min_age || course.max_age
    ? `${course.min_age || '0'}-${course.max_age || '∞'} Jahre`
    : null;

  // Participation percentage
  const participationPercent = course.this_week_max_spots 
    ? Math.round((course.this_week_participants || 0) / course.this_week_max_spots * 100)
    : 0;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      {/* Color bar */}
      <div 
        className="h-2" 
        style={{ backgroundColor: course.color }}
      />
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold text-lg">{course.name}</h3>
          </div>
          {!course.is_active && (
            <Badge variant="secondary">Inaktiv</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          <Badge variant="outline">{skillLabel}</Badge>
          <Badge variant="outline">{disciplineLabel}</Badge>
          {ageRange && <Badge variant="outline">{ageRange}</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Schedule info */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{dayLabels.join('-') || 'Kein Zeitplan'}</span>
          </div>
          {timeSlots.map((slot, idx) => (
            <div key={idx} className="flex items-center gap-2 text-muted-foreground ml-6">
              <Clock className="h-4 w-4" />
              <span>{slot}</span>
            </div>
          ))}
        </div>

        {/* Capacity */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>Max. {course.max_participants} Teilnehmer</span>
        </div>

        {/* Meeting point */}
        {course.meeting_point && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="truncate">{course.meeting_point}</span>
          </div>
        )}

        {/* Price */}
        <div className="text-sm font-medium">
          CHF {course.price_per_day.toFixed(0)}/Tag
          {course.price_full_week && (
            <span className="text-muted-foreground font-normal">
              {' '}• CHF {course.price_full_week.toFixed(0)}/Woche
            </span>
          )}
        </div>

        {/* This week stats */}
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground mb-1">Diese Woche:</p>
          {course.assigned_instructor && (
            <p className="text-sm mb-1">
              👨‍🏫 {course.assigned_instructor.first_name} {course.assigned_instructor.last_name}
            </p>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(participationPercent, 100)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {course.this_week_participants || 0}/{course.this_week_max_spots || 0} Plätze
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => onEdit(course)}
          >
            <Edit className="h-4 w-4 mr-1" />
            Bearbeiten
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => onViewInstances(course)}
          >
            <List className="h-4 w-4 mr-1" />
            Instanzen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
