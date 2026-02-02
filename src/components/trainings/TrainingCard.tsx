import { format } from 'date-fns';
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
  Snowflake,
  AlertTriangle,
  Copy,
  Trash2,
  ArrowRight,
  BarChart3
} from 'lucide-react';
import type { GroupCourseWithSchedules } from '@/types/group-courses';
import { DISCIPLINES, DAYS_OF_WEEK } from '@/types/group-courses';

interface TrainingCardProps {
  course: GroupCourseWithSchedules;
  onEdit: (course: GroupCourseWithSchedules) => void;
  onCopy: (course: GroupCourseWithSchedules) => void;
  onViewCapacity: (course: GroupCourseWithSchedules) => void;
  onDelete: (course: GroupCourseWithSchedules) => void;
}

export function TrainingCard({ course, onEdit, onCopy, onViewCapacity, onDelete }: TrainingCardProps) {
  const disciplineLabel = DISCIPLINES.find(d => d.value === course.discipline)?.label || course.discipline;

  const isSaturdayCourse = course.course_type === 'saturday_course';
  const isOfficeCourse = course.course_type === 'office' || course.is_internal;

  // Get unique days from schedules (for weekly courses)
  const scheduleDays = [...new Set(course.schedules.map(s => s.day_of_week))].sort();
  const dayLabels = scheduleDays.map(d => DAYS_OF_WEEK.find(dw => dw.value === d)?.label).filter(Boolean);

  // Get unique time slots
  const timeSlots = [...new Set(course.schedules.map(s => `${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`))];

  // Age range text - ALWAYS display age range (required field) - not for office
  const ageRangeLabel = !isOfficeCourse ? `${course.min_age}-${course.max_age} J.` : null;

  // Participation percentage
  const participationPercent = course.this_week_max_spots 
    ? Math.round((course.this_week_participants || 0) / course.this_week_max_spots * 100)
    : 0;

  // Check if product is linked
  const hasLinkedProduct = !!course.product;

  // Saturday course dates count
  const saturdayCount = course.course_dates?.length || 
    (course.period_start_date && course.period_end_date ? 5 : 0);

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
            {isOfficeCourse ? (
              <span className="text-lg">🏢</span>
            ) : (
              <Snowflake className="h-5 w-5 text-muted-foreground" />
            )}
            <h3 className="font-semibold text-lg">{course.name}</h3>
          </div>
          <div className="flex gap-1.5">
            {isOfficeCourse && (
              <Badge variant="secondary">Intern</Badge>
            )}
            {isSaturdayCourse && (
              <Badge variant="secondary">Samstagskurs</Badge>
            )}
            {!course.is_active && (
              <Badge variant="secondary">Inaktiv</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {!isOfficeCourse && (
            <Badge variant="outline">{disciplineLabel}</Badge>
          )}
          {ageRangeLabel && (
            <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">{ageRangeLabel}</Badge>
          )}
          {course.next_training && (
            <Badge variant="outline" className="flex items-center gap-1 text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              {course.next_training.name}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Schedule info - different for different course types */}
        {isOfficeCourse ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{dayLabels.join(', ') || 'Kein Zeitplan'}</span>
            </div>
            {timeSlots.map((slot, idx) => (
              <div key={idx} className="flex items-center gap-2 text-muted-foreground ml-6">
                <Clock className="h-4 w-4" />
                <span>{slot}</span>
              </div>
            ))}
          </div>
        ) : isSaturdayCourse ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {course.period_start_date && course.period_end_date ? (
                  <>
                    {format(new Date(course.period_start_date), 'dd.MM.')} – {format(new Date(course.period_end_date), 'dd.MM.yyyy')}
                  </>
                ) : (
                  'Keine Periode definiert'
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground ml-6">
              <Clock className="h-4 w-4" />
              <span>{saturdayCount} Samstage • 10:00-14:00</span>
            </div>
          </div>
        ) : (
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
        )}

        {/* Capacity */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>Max. {course.max_participants} {isOfficeCourse ? 'Mitarbeiter' : 'Teilnehmer'}</span>
        </div>

        {/* Meeting point - not for office */}
        {!isOfficeCourse && course.meeting_point && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="truncate">{course.meeting_point}</span>
          </div>
        )}

        {/* Product - not for office */}
        {!isOfficeCourse && (
          <div className="text-sm">
            {hasLinkedProduct ? (
              <div className="flex items-center gap-2">
                <span className="font-medium">{course.product!.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {course.product!.pricing_type === 'tiered' ? 'Staffel' : 
                   course.product!.pricing_type === 'hourly' ? 'Stunde' : 'Fix'}
                </Badge>
              </div>
            ) : (
              <span className="text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Kein Produkt verknüpft
              </span>
            )}
          </div>
        )}

        {/* This week stats (only for weekly courses, not office) */}
        {!isSaturdayCourse && !isOfficeCourse && (
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
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
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
            onClick={() => onCopy(course)}
            title="Duplizieren"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => onViewCapacity(course)}
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            Kapazität
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onDelete(course)}
            title="Löschen"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
