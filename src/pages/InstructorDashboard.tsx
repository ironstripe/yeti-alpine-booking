import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { TodayHeader } from "@/components/instructor-portal/TodayHeader";
import { LessonCard } from "@/components/instructor-portal/LessonCard";
import { TomorrowPreview } from "@/components/instructor-portal/TomorrowPreview";
import { useInstructorPortalData } from "@/hooks/useInstructorPortalData";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Coffee } from "lucide-react";

export default function InstructorDashboard() {
  const { todayLessons, todayStats, tomorrow, isLoading } = useInstructorPortalData();

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </InstructorLayout>
    );
  }

  return (
    <InstructorLayout>
      <div className="space-y-6">
        {/* Header with greeting and today's stats */}
        <TodayHeader
          lessonCount={todayStats.lessonCount}
          totalHours={todayStats.totalHours}
          participantCount={todayStats.participantCount}
        />

        {/* Today's Lessons */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            MEINE LEKTIONEN
          </h2>

          {todayLessons.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Coffee className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium">Keine Lektionen heute</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Geniesse deinen freien Tag! ⛷️
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {todayLessons.map((lesson) => (
                <LessonCard 
                  key={lesson.id} 
                  lesson={lesson}
                />
              ))}

              {/* End of day indicator */}
              <Card className="border-dashed bg-green-50/50 dark:bg-green-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      🏁
                    </div>
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-400">
                        Feierabend nach {todayLessons[todayLessons.length - 1]?.timeEnd?.slice(0, 5) || "16:00"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Tomorrow Preview */}
        {tomorrow && (
          <div className="space-y-3">
            <TomorrowPreview
              date={tomorrow.date}
              lessonCount={tomorrow.lessonCount}
              totalHours={tomorrow.totalHours}
            />
          </div>
        )}
      </div>
    </InstructorLayout>
  );
}
