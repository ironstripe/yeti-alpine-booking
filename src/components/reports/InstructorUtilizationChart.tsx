import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InstructorStats } from "@/hooks/useReportsData";

interface InstructorUtilizationChartProps {
  data: InstructorStats[] | undefined;
  isLoading: boolean;
}

export function InstructorUtilizationChart({ data, isLoading }: InstructorUtilizationChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auslastung pro Skilehrer</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const avgUtilization = data?.length 
    ? Math.round(data.reduce((sum, i) => sum + i.utilization, 0) / data.length) 
    : 0;
  const targetUtilization = 70;

  const getUtilizationColor = (value: number) => {
    if (value >= 80) return "bg-green-500";
    if (value >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auslastung pro Skilehrer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.slice(0, 10).map((instructor) => (
          <div key={instructor.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate max-w-[150px]">
                {instructor.name.split(" ").map(n => n[0]).join(". ")}.
              </span>
              <span className="font-medium">{instructor.utilization}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${getUtilizationColor(instructor.utilization)}`}
                style={{ width: `${Math.min(instructor.utilization, 100)}%` }}
              />
            </div>
          </div>
        ))}

        <div className="pt-4 border-t text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Durchschnitt: {avgUtilization}%</span>
            <span>Ziel: {targetUtilization}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
