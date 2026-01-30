import { AlertTriangle, Calendar } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

export interface DateConflict {
  date: string;
  mentioned_weekday: string | null;
  actual_weekday: string;
  is_valid: boolean;
  conflict_type: "none" | "weekday_mismatch";
  suggestion: string | null;
  participant_name?: string;
}

interface DateConflictWarningProps {
  conflicts: DateConflict[];
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "dd.MM.yyyy", { locale: de });
  } catch {
    return dateStr;
  }
}

export function DateConflictWarning({ conflicts }: DateConflictWarningProps) {
  if (!conflicts || conflicts.length === 0) return null;

  return (
    <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-700 dark:text-amber-500">
        Datum/Wochentag-Konflikt erkannt
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-2">
          {conflicts.map((conflict, idx) => (
            <div
              key={idx}
              className="p-2 bg-white/50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800"
            >
              {conflict.participant_name && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                  {conflict.participant_name}
                </p>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3 w-3 text-amber-600" />
                <span className="text-amber-800 dark:text-amber-300">
                  <strong>Genannt:</strong> {conflict.mentioned_weekday},{" "}
                  {formatDate(conflict.date)}
                </span>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400 ml-5">
                <strong>Tatsächlich:</strong> {conflict.actual_weekday}
              </p>
              {conflict.suggestion && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 ml-5 flex items-center gap-1">
                  💡 {conflict.suggestion}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-amber-700 dark:text-amber-400 font-medium text-sm">
          ⚠️ Bitte beim Kunden nachfragen, bevor die Buchung erstellt wird.
        </p>
      </AlertDescription>
    </Alert>
  );
}
