import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startOfWeek, format } from 'date-fns';
import { resolvePlanningWeek } from '@/lib/schedulerCourseLink';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const weekParam = searchParams.get('week');
  const courseParam = searchParams.get('course');
  const dateParam = searchParams.get('date');
  const instanceParam = searchParams.get('instance');
  const linkWeek = resolvePlanningWeek(weekParam, dateParam);
  const invalidLink = !!courseParam && (weekParam || dateParam) !== null && !linkWeek;

  const [currentWeek, setCurrentWeek] = useState(
    () => linkWeek ?? startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // Follow browser back/forward between deep links: the URL week wins.
  const linkWeekKey = linkWeek ? format(linkWeek, 'yyyy-MM-dd') : null;
  useEffect(() => {
    if (linkWeek && format(currentWeek, 'yyyy-MM-dd') !== linkWeekKey) setCurrentWeek(linkWeek);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkWeekKey]);

  const { courses, isLoading, hasInstances, stats } = useGroupPlanningData(currentWeek);
  const weekMatchesLink = !!linkWeekKey && format(currentWeek, 'yyyy-MM-dd') === linkWeekKey;
  const linkedCourse = courseParam && weekMatchesLink ? courses.find((c) => c.id === courseParam) ?? null : null;
  const linkedInstance = linkedCourse && instanceParam
    ? linkedCourse.instances.find((i) => i.id === instanceParam) ?? null
    : null;
  const linkProblem = !courseParam || isLoading || !weekMatchesLink
    ? (invalidLink ? 'Der Link enthält kein gültiges Datum.' : null)
    : !linkedCourse
      ? 'Dieser Kurs ist in der verlinkten Woche nicht (mehr) vorhanden.'
      : instanceParam && !linkedInstance
        ? 'Der verlinkte Termin existiert nicht mehr. Die übrigen Termine des Kurses dieser Woche werden angezeigt.'
        : null;

  // Open the exact linked course once its week has loaded; never another course or week.
  useEffect(() => {
    if (linkedCourse) setSelectedCourseId(linkedCourse.id);
  }, [linkedCourse?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCourse = selectedCourseId ? courses.find((c) => c.id === selectedCourseId) ?? null : null;
  const closeCourse = () => {
    setSelectedCourseId(null);
    if (courseParam) {
      const next = new URLSearchParams(searchParams);
      next.delete('course'); next.delete('instance'); next.delete('date');
      setSearchParams(next, { replace: true });
    }
  };
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

      {linkProblem && (
        <div role="alert" data-testid="planning-link-problem" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {linkProblem}
        </div>
      )}

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
              onDetailsClick={() => setSelectedCourseId(course.id)}
            />
          ))}
        </div>
      )}

      <DailyAssignmentModal
        open={!!selectedCourse}
        onOpenChange={(open) => {
          if (!open) closeCourse();
        }}
        course={selectedCourse}
        focusInstanceId={selectedCourse && selectedCourse.id === courseParam ? linkedInstance?.id ?? null : null}
        weekStart={currentWeek}
        instructors={instructors}
      />
    </TrainingsLayout>
  );
}
