import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConflictResult } from "@/hooks/useInstructorAvailabilityCheck";

interface AvailabilityStatusProps {
  conflicts: ConflictResult[] | undefined;
  isLoading: boolean;
  instructorName?: string;
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "EEE, dd.MM.yyyy", { locale: de });
  } catch {
    return dateStr;
  }
}

export function AvailabilityStatus({ 
  conflicts, 
  isLoading, 
  instructorName 
}: AvailabilityStatusProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Verfügbarkeit wird geprüft...
        </span>
      </div>
    );
  }

  if (!conflicts || conflicts.length === 0) {
    return (
      <Alert className="border-primary/30 bg-primary/5">
        <CheckCircle className="h-4 w-4 text-primary" />
        <AlertDescription className="text-foreground">
          {instructorName 
            ? `${instructorName} ist für den gesamten Zeitraum verfügbar.`
            : "Lehrer ist für den gesamten Zeitraum verfügbar."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-destructive/30 bg-destructive/5">
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <AlertTitle className="text-foreground">
        Konflikte gefunden ({conflicts.length})
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1">
          {conflicts.slice(0, 5).map((c, i) => (
            <li key={i} className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{formatDate(c.date)}</span>
              {" – "}
              {c.description}
            </li>
          ))}
          {conflicts.length > 5 && (
            <li className="text-sm text-muted-foreground">
              ... und {conflicts.length - 5} weitere Konflikte
            </li>
          )}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Die Buchung kann trotzdem erstellt werden. Konflikte müssen später aufgelöst werden 
          (z.B. anderen Lehrer für einzelne Tage zuweisen).
        </p>
      </AlertDescription>
    </Alert>
  );
}
