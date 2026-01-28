import { CheckCircle, AlertCircle, XCircle, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { GroupPlanningStats as StatsType } from '@/hooks/useGroupPlanningData';

interface GroupPlanningStatsProps {
  stats: StatsType;
}

export function GroupPlanningStats({ stats }: GroupPlanningStatsProps) {
  const assignedPercentage = stats.totalCourses > 0
    ? Math.round((stats.fullyAssigned / stats.totalCourses) * 100)
    : 0;

  const coursesWithInstances = stats.fullyAssigned + stats.partiallyAssigned + stats.unassigned;

  if (coursesWithInstances === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardContent className="py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium">{stats.fullyAssigned} zugewiesen</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-medium">{stats.partiallyAssigned} teilweise</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-sm font-medium">{stats.unassigned} offen</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{stats.totalParticipants} Teilnehmer</span>
            </div>
            
            <div className="flex items-center gap-3 min-w-[140px]">
              <Progress value={assignedPercentage} className="h-2 flex-1" />
              <span className="text-sm font-medium text-muted-foreground w-10 text-right">
                {assignedPercentage}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
