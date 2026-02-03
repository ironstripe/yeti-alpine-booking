import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startOfWeek, parseISO } from 'date-fns';
import { Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GroupPlanningHeader } from '@/components/planning/GroupPlanningHeader';
import { GroupPlanningStats } from '@/components/planning/GroupPlanningStats';
import { GroupPlanningCourseCard } from '@/components/planning/GroupPlanningCourseCard';
import { DailyAssignmentModal } from '@/components/planning/DailyAssignmentModal';
import { TrainingsLayout } from '@/components/trainings/TrainingsLayout';
import { useGroupPlanningData, type GroupPlanningCourse } from '@/hooks/useGroupPlanningData';
import { useInstructors } from '@/hooks/useInstructors';
import { useGenerateInstances, useCopyWeekAssignments } from '@/hooks/useGroupCourses';

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="h-2 w-full" />
          <div className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 w-20" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ onGenerate, isGenerating }: { onGenerate: () => void; isGenerating: boolean }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">Keine Instanzen vorhanden</h3>
        <p className="text-muted-foreground text-center mb-6 max-w-sm">
          Für diese Woche wurden noch keine Kursinstanzen generiert. 
          Klicke auf den Button, um die Woche zu initialisieren.
        </p>
        <Button onClick={onGenerate} disabled={isGenerating}>
          <Calendar className="h-4 w-4 mr-2" />
          Woche generieren
        </Button>
      </CardContent>
    </Card>
  );
}

function NoCourses() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-1">Keine aktiven Gruppenkurse</h3>
        <p className="text-muted-foreground text-center max-w-sm">
          Es sind keine aktiven wöchentlichen Gruppenkurse vorhanden. 
          Erstelle zuerst Kurse unter Trainings.
        </p>
      </CardContent>
    </Card>
  );
}

export default function GroupCoursePlanning() {
  const [searchParams] = useSearchParams();
  const weekParam = searchParams.get('week');
  
  const [currentWeek, setCurrentWeek] = useState(() => {
    if (weekParam) {
      try {
        return parseISO(weekParam);
      } catch {
        return startOfWeek(new Date(), { weekStartsOn: 1 });
      }
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  const [selectedCourse, setSelectedCourse] = useState<GroupPlanningCourse | null>(null);

  const { courses, isLoading, hasInstances, stats } = useGroupPlanningData(currentWeek);
  const { data: instructors = [] } = useInstructors();

  const generateMutation = useGenerateInstances();
  const copyMutation = useCopyWeekAssignments();

  const handleGenerate = () => {
    generateMutation.mutate({ weekStart: currentWeek });
  };

  const handleCopyFromPrevious = () => {
    // Calculate previous week
    const previousWeek = new Date(currentWeek);
    previousWeek.setDate(previousWeek.getDate() - 7);
    copyMutation.mutate({ sourceWeekStart: previousWeek, targetWeekStart: currentWeek });
  };

  return (
    <TrainingsLayout>

      <GroupPlanningHeader
        weekStart={currentWeek}
        onWeekChange={setCurrentWeek}
        onGenerate={handleGenerate}
        onCopyFromPrevious={handleCopyFromPrevious}
        isGenerating={generateMutation.isPending}
        isCopying={copyMutation.isPending}
        hasInstances={hasInstances}
      />

      {!isLoading && hasInstances && <GroupPlanningStats stats={stats} />}

      {isLoading ? (
        <LoadingSkeleton />
      ) : courses.length === 0 ? (
        <NoCourses />
      ) : !hasInstances ? (
        <EmptyState onGenerate={handleGenerate} isGenerating={generateMutation.isPending} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map(course => (
            <GroupPlanningCourseCard
              key={course.id}
              course={course}
              weekStart={currentWeek}
              instructors={instructors}
              onDetailsClick={() => setSelectedCourse(course)}
            />
          ))}
        </div>
      )}

      <DailyAssignmentModal
        open={!!selectedCourse}
        onOpenChange={(open) => {
          if (!open) setSelectedCourse(null);
        }}
        course={selectedCourse}
        weekStart={currentWeek}
        instructors={instructors}
      />
    </TrainingsLayout>
  );
}
