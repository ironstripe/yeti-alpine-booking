import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, ChevronRight, AlertTriangle } from "lucide-react";
import { usePendingAbsences, useApproveAbsence, useRejectAbsence } from "@/hooks/useAbsenceApproval";
import { useAbsenceConflicts } from "@/hooks/useAbsenceConflicts";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DashboardTaskCard } from "./DashboardTaskCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

export function AbsenceRequestsBox() {
  const navigate = useNavigate();
  const { data: pendingAbsences, isLoading } = usePendingAbsences();
  const { mutate: approveAbsence } = useApproveAbsence();
  const { mutate: rejectAbsence } = useRejectAbsence();

  const absencesForConflictCheck = useMemo(
    () =>
      (pendingAbsences || []).map((a) => ({
        id: a.id,
        instructorId: a.instructorId,
        startDate: a.startDate,
        endDate: a.endDate,
      })),
    [pendingAbsences]
  );

  const { data: conflictMap = {} } = useAbsenceConflicts(absencesForConflictCheck);

  const handleApprove = (e: React.MouseEvent, absenceId: string) => {
    e.stopPropagation();
    approveAbsence(absenceId);
  };

  const handleReject = (e: React.MouseEvent, absenceId: string) => {
    e.stopPropagation();
    rejectAbsence({ absenceId, reason: "Abgelehnt vom Dashboard" });
  };

  if (isLoading) {
    return (
      <DashboardTaskCard title="Abwesenheitsanträge" count={0}>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </DashboardTaskCard>
    );
  }

  const count = pendingAbsences?.length || 0;

  return (
    <DashboardTaskCard
      title="Abwesenheitsanträge"
      count={count}
      isEmpty={count === 0}
      emptyMessage="Keine offenen Anträge"
    >
      <div className="space-y-2">
        {pendingAbsences?.slice(0, 3).map((absence) => {
          const conflicts = conflictMap[absence.id] || [];
          const hasConflicts = conflicts.length > 0;

          return (
            <div
              key={absence.id}
              className="flex items-center gap-2 p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(`/scheduler?date=${absence.startDate}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{absence.instructorName}</p>
                  {hasConflicts && (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1 py-0"
                    >
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      {conflicts.length}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(absence.startDate), "d. MMM", { locale: de })}
                  {absence.startDate !== absence.endDate && (
                    <> - {format(new Date(absence.endDate), "d. MMM", { locale: de })}</>
                  )}
                  <span className="mx-1">•</span>
                  <span className="capitalize">{absence.type}</span>
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100"
                  onClick={(e) => handleApprove(e, absence.id)}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100"
                  onClick={(e) => handleReject(e, absence.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}

        {count > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => navigate("/scheduler")}
          >
            Alle {count} anzeigen
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
    </DashboardTaskCard>
  );
}
