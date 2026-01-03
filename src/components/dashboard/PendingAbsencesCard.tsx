import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Check, X, ChevronRight, AlertTriangle } from "lucide-react";
import { usePendingAbsences, useApproveAbsence, useRejectAbsence } from "@/hooks/useAbsenceApproval";
import { useAbsenceConflicts } from "@/hooks/useAbsenceConflicts";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export function PendingAbsencesCard() {
  const navigate = useNavigate();
  const { data: pendingAbsences, isLoading } = usePendingAbsences();
  const { mutate: approveAbsence } = useApproveAbsence();
  const { mutate: rejectAbsence } = useRejectAbsence();

  // Prepare absence data for conflict check
  const absencesForConflictCheck = useMemo(() => 
    (pendingAbsences || []).map(a => ({
      id: a.id,
      instructorId: a.instructorId,
      startDate: a.startDate,
      endDate: a.endDate,
    })),
    [pendingAbsences]
  );

  const { data: conflictMap = {} } = useAbsenceConflicts(absencesForConflictCheck);

  const pendingCount = pendingAbsences?.length || 0;

  const handleApprove = (absenceId: string) => {
    approveAbsence(absenceId);
  };

  const handleReject = (absenceId: string) => {
    rejectAbsence({ absenceId, reason: "Abgelehnt vom Dashboard" });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Abwesenheitsanträge
          {pendingCount > 0 && (
            <Badge variant="outline" className="ml-auto text-xs bg-amber-100 text-amber-800 border-amber-300">
              {pendingCount} offen
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Laden...</p>
        )}
        
        {!isLoading && pendingCount === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            Keine offenen Anträge
          </p>
        )}
        
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
                  <p className="text-sm font-medium truncate">
                    {absence.instructorName}
                  </p>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApprove(absence.id);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReject(absence.id);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        
        {pendingCount > 3 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full h-8 text-xs"
            onClick={() => navigate("/scheduler")}
          >
            Alle {pendingCount} anzeigen
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
