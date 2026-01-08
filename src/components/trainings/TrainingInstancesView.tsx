import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, addWeeks, subWeeks, eachDayOfInterval, endOfWeek, getDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  AlertTriangle,
  UserPlus
} from 'lucide-react';
import { 
  useGroupCourse, 
  useGroupCourseInstances, 
  useGenerateInstances,
  useAssignInstructor,
  useBulkAssignInstructor
} from '@/hooks/useGroupCourses';
import { useInstructors } from '@/hooks/useInstructors';
import type { GroupCourseInstance } from '@/types/group-courses';
import { DAYS_OF_WEEK } from '@/types/group-courses';

interface TrainingInstancesViewProps {
  courseId: string;
  onBack: () => void;
}

export function TrainingInstancesView({ courseId, onBack }: TrainingInstancesViewProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: course, isLoading: courseLoading } = useGroupCourse(courseId);
  const { data: instances, isLoading: instancesLoading } = useGroupCourseInstances(courseId, weekStart);
  const { data: instructors } = useInstructors();
  
  const generateInstances = useGenerateInstances();
  const assignInstructor = useAssignInstructor();
  const bulkAssignInstructor = useBulkAssignInstructor();

  // Generate instances for this week if none exist
  useEffect(() => {
    if (course && instances !== undefined && instances.length === 0 && course.schedules.length > 0) {
      generateInstances.mutate({ courseId, weekStart });
    }
  }, [course, instances, courseId, weekStart]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    setWeekStart(prev => direction === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1));
  };

  const handleAssignInstructor = (instanceId: string, instructorId: string | null) => {
    assignInstructor.mutate({ instanceId, instructorId });
  };

  const handleBulkAssign = (instructorId: string) => {
    bulkAssignInstructor.mutate({ courseId, weekStart, instructorId });
  };

  // Group instances by date
  const instancesByDate = instances?.reduce((acc, instance) => {
    if (!acc[instance.date]) acc[instance.date] = [];
    acc[instance.date].push(instance);
    return acc;
  }, {} as Record<string, GroupCourseInstance[]>) || {};

  const isLoading = courseLoading || instancesLoading;

  const activeInstructors = instructors?.filter(i => i.status === 'active') || [];

  // Calculate week number
  const weekNumber = format(weekStart, 'w', { locale: de });

  return (
    <>
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center">
          <span 
            className="inline-block w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: course?.color }}
          />
          <h1 className="text-xl font-semibold">{course?.name || 'Training'} - Instanzen</h1>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{course?.description || 'Wochenübersicht und Lehrerzuweisung'}</p>

      <PageHeader
        title=""
        description=""
      />

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium px-3">
            KW {weekNumber}: {format(weekStart, 'd.', { locale: de })} - {format(weekEnd, 'd. MMMM yyyy', { locale: de })}
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Bulk assign */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Für ganze Woche:</span>
          <Select onValueChange={handleBulkAssign}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Lehrer zuweisen" />
            </SelectTrigger>
            <SelectContent>
              {activeInstructors.map(instructor => (
                <SelectItem key={instructor.id} value={instructor.id}>
                  {instructor.first_name} {instructor.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Instances by day */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {daysInWeek.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayInstances = instancesByDate[dateStr] || [];
            const dayOfWeek = getDay(day);
            const dayLabel = DAYS_OF_WEEK.find(d => d.value === dayOfWeek)?.fullLabel;
            const hasScheduleForDay = course?.schedules.some(s => s.day_of_week === dayOfWeek);

            if (!hasScheduleForDay && dayInstances.length === 0) {
              return null; // Skip days without schedules
            }

            return (
              <Card key={dateStr}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">
                    {dayLabel}, {format(day, 'd. MMMM', { locale: de })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dayInstances.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Keine Instanzen</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {dayInstances.map(instance => (
                        <InstanceCard
                          key={instance.id}
                          instance={instance}
                          instructors={activeInstructors}
                          maxParticipants={course?.max_participants || 8}
                          onAssignInstructor={handleAssignInstructor}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

interface InstanceCardProps {
  instance: GroupCourseInstance;
  instructors: Array<{ id: string; first_name: string; last_name: string; real_time_status?: string | null }>;
  maxParticipants: number;
  onAssignInstructor: (instanceId: string, instructorId: string | null) => void;
}

function InstanceCard({ instance, instructors, maxParticipants, onAssignInstructor }: InstanceCardProps) {
  const timeSlot = `${instance.start_time.slice(0, 5)} - ${instance.end_time.slice(0, 5)}`;
  const hasInstructor = !!instance.instructor_id;
  const participantCount = instance.current_participants || 0;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{timeSlot}</span>
        {instance.status === 'cancelled' && (
          <Badge variant="destructive">Abgesagt</Badge>
        )}
      </div>

      {/* Instructor assignment */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Lehrer</label>
        <Select
          value={instance.instructor_id || ''}
          onValueChange={(value) => onAssignInstructor(instance.id, value || null)}
        >
          <SelectTrigger className={!hasInstructor ? 'border-destructive' : ''}>
            <SelectValue placeholder="Lehrer zuweisen">
              {instance.instructor 
                ? `${instance.instructor.first_name} ${instance.instructor.last_name}`
                : 'Nicht zugewiesen'
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Nicht zugewiesen</SelectItem>
            {instructors.map(instructor => (
              <SelectItem key={instructor.id} value={instructor.id}>
                <div className="flex items-center gap-2">
                  <span 
                    className={`w-2 h-2 rounded-full ${
                      instructor.real_time_status === 'available' 
                        ? 'bg-green-500' 
                        : instructor.real_time_status === 'teaching'
                        ? 'bg-yellow-500'
                        : 'bg-gray-400'
                    }`}
                  />
                  {instructor.first_name} {instructor.last_name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Warning if no instructor */}
      {!hasInstructor && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          <span>Lehrer zuweisen!</span>
        </div>
      )}

      {/* Participants */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{participantCount}/{maxParticipants} Teilnehmer</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          <UserPlus className="h-3 w-3 mr-1" />
          Anzeigen
        </Button>
      </div>

      {/* Participant progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min((participantCount / maxParticipants) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
