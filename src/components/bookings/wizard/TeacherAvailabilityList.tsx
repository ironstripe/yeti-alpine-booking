import { useMemo, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, CalendarClock, Check, Clock, RefreshCw, Search } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import type { SchedulerInstructor } from "@/lib/scheduler-utils";
import { toMin } from "@/lib/privatePlan";
import {
  canSelectForWholePlan,
  evaluateTeacherCoverage,
  filterEligibleInstructors,
  hasPinnedTeachers,
  type IntendedInterval,
  type IntervalPlan,
  type TeacherCoverage,
} from "@/lib/teacherShortlist";

export type SchedulerAvailabilityData = ReturnType<typeof useSchedulerData>;

/**
 * Loads the existing scheduler data ONCE for the selected date range and hands
 * it to both the teacher list and the mini scheduler (no second fetch layer,
 * no duplicate realtime channels). Mounted only while a private item has dates.
 */
export function SchedulerAvailabilityScope({
  selectedDates,
  children,
}: {
  selectedDates: string[];
  children: (data: SchedulerAvailabilityData) => ReactNode;
}) {
  const range = useMemo(() => {
    const sorted = [...selectedDates].sort();
    return { start: parseISO(sorted[0]), end: parseISO(sorted[sorted.length - 1]) };
  }, [selectedDates]);
  const data = useSchedulerData({ startDate: range.start, endDate: range.end });
  return <>{children(data)}</>;
}

interface TeacherAvailabilityListProps {
  plan: IntervalPlan;
  sport: "ski" | "snowboard" | null;
  language: string;
  data: SchedulerAvailabilityData;
  preferredTeacher: string;
  selectedInstructorId: string | null;
  onSelect: (instructor: SchedulerInstructor, intervals: IntendedInterval[]) => void;
  onFocusMissingTime: () => void;
  onChangeAppointment: () => void;
  onAssignLater: () => void;
  onClearPreferredTeacher: () => void;
  onSearchOtherTimes: () => void;
}

const fmtDay = (date: string) => format(parseISO(date), "EEE d.M.", { locale: de });
const fmtHours = (iv: Pick<IntendedInterval, "startTime" | "endTime">) => {
  const h = (toMin(iv.endTime) - toMin(iv.startTime)) / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
};
const disciplineIcon = (s: string | null) => (s === "ski" ? "⛷️" : s === "snowboard" ? "🏂" : s === "both" ? "⛷️🏂" : "");
const byName = (a: SchedulerInstructor, b: SchedulerInstructor) =>
  a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);

export function TeacherAvailabilityList({
  plan,
  sport,
  language,
  data,
  preferredTeacher,
  selectedInstructorId,
  onSelect,
  onFocusMissingTime,
  onChangeAppointment,
  onAssignLater,
  onClearPreferredTeacher,
  onSearchOtherTimes,
}: TeacherAvailabilityListProps) {
  const intervals = plan.status === "ready" ? plan.intervals : [];
  const dates = useMemo(() => [...new Set(intervals.map((iv) => iv.date))], [intervals]);

  const classified = useMemo(() => {
    const full: { instructor: SchedulerInstructor; coverage: TeacherCoverage }[] = [];
    const partial: { instructor: SchedulerInstructor; coverage: TeacherCoverage }[] = [];
    let none = 0;
    if (plan.status !== "ready" || !sport || data.isLoading || data.error) return { full, partial, none };
    for (const instructor of filterEligibleInstructors(data.instructors, sport, language).sort(byName)) {
      const coverage = evaluateTeacherCoverage(instructor.id, intervals, data.bookings, data.absences);
      if (coverage.status === "full") full.push({ instructor, coverage });
      else if (coverage.status === "partial") partial.push({ instructor, coverage });
      else none += 1;
    }
    return { full, partial, none };
  }, [plan.status, intervals, sport, language, data.instructors, data.bookings, data.absences, data.isLoading, data.error]);

  const query = preferredTeacher.trim().toLowerCase();
  const matchesQuery = (i: SchedulerInstructor) =>
    query.length < 2 || `${i.first_name} ${i.last_name}`.toLowerCase().includes(query);
  const fullShown = classified.full.filter((r) => matchesQuery(r.instructor));
  const partialShown = classified.partial.filter((r) => matchesQuery(r.instructor));
  const pinned = plan.status === "ready" && hasPinnedTeachers(intervals);

  const otherTimesButton = (
    <Button type="button" variant="ghost" size="sm" className="control-target gap-1" onClick={onSearchOtherTimes}>
      <CalendarClock className="h-4 w-4" />
      Andere Zeiten suchen
    </Button>
  );

  const prompt = (text: string, action?: ReactNode) => (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <p className="text-sm text-muted-foreground">{text}</p>
      <div className="flex flex-wrap gap-2">
        {action}
        {otherTimesButton}
      </div>
    </div>
  );

  let body: ReactNode;
  if (plan.status === "missing_dates") {
    body = prompt("Datum auswählen, um verfügbare Lehrpersonen zu sehen.");
  } else if (plan.status === "missing_time") {
    body = prompt(
      plan.datesWithoutTime.length === dates.length || dates.length === 0
        ? "Start- und Endzeit wählen, um verfügbare Lehrpersonen zu sehen."
        : `Zeit fehlt für ${plan.datesWithoutTime.map(fmtDay).join(", ")}.`,
      <Button type="button" variant="outline" size="sm" className="control-target" onClick={onFocusMissingTime}>
        Zeitfenster wählen
      </Button>,
    );
  } else if (!sport) {
    body = prompt("Sportart wählen, um passende Lehrpersonen zu sehen.");
  } else if (data.isLoading) {
    body = (
      <div className="space-y-2" aria-busy="true" aria-label="Verfügbarkeit wird geladen">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  } else if (data.error) {
    body = (
      <Alert variant="destructive" className="py-2">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="space-y-2 text-sm">
          <p>Verfügbarkeit konnte nicht geladen werden. Es wird keine Lehrperson als verfügbar angezeigt.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="control-target gap-1" onClick={() => data.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Erneut laden
            </Button>
            {otherTimesButton}
          </div>
        </AlertDescription>
      </Alert>
    );
  } else if (classified.full.length === 0 && classified.partial.length === 0) {
    body = (
      <div className="space-y-2 rounded-md border border-dashed p-3">
        <p className="text-sm font-medium text-foreground">Für diesen Zeitraum ist keine passende Lehrperson verfügbar.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="control-target" onClick={onChangeAppointment}>
            Termin ändern
          </Button>
          <Button type="button" variant="outline" size="sm" className="control-target" onClick={onAssignLater}>
            Später zuweisen
          </Button>
          {otherTimesButton}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {pinned && (
          <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            Einzelne Termine haben bereits eine feste Lehrperson. Eine andere Lehrperson für den ganzen Plan ist hier nicht wählbar – tageweise Zuweisung über „Andere Zeiten suchen“.
          </p>
        )}
        {query.length >= 2 && fullShown.length === 0 && partialShown.length === 0 ? (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <p className="text-sm text-muted-foreground">Keine verfügbare Lehrperson passt zu „{preferredTeacher.trim()}“.</p>
            <Button type="button" variant="outline" size="sm" className="control-target" onClick={onClearPreferredTeacher}>
              Suche zurücksetzen
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Für alle Termine verfügbar ({fullShown.length})
              </h3>
              {fullShown.length > 0 ? (
                <ul className="divide-y rounded-md border" aria-label="Für alle Termine verfügbare Lehrpersonen">
                  {fullShown.map(({ instructor }) => {
                    const selected = selectedInstructorId === instructor.id;
                    const selectable = canSelectForWholePlan(instructor.id, intervals, { status: "full", blocked: [] });
                    const hasOtherBookings = data.bookings.some((b) => b.instructorId === instructor.id && dates.includes(b.date));
                    return (
                      <li
                        key={instructor.id}
                        data-testid="teacher-row-full"
                        className={cn("flex items-center gap-3 px-3 py-2", selected && "bg-primary/5")}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {instructor.first_name} {instructor.last_name}
                            <span className="ml-1.5" aria-hidden="true">{disciplineIcon(instructor.specialization)}</span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {(instructor.languages || []).map((l) => l.toUpperCase()).join(" · ") || "Keine Sprache hinterlegt"}
                            {hasOtherBookings && " · Hat an diesen Tagen bereits Buchungen"}
                          </p>
                        </div>
                        {selected && (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Check className="h-3 w-3" />
                            Ausgewählt
                          </Badge>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="control-target shrink-0"
                          disabled={!selectable}
                          aria-label={`${instructor.first_name} ${instructor.last_name} für alle Termine auswählen`}
                          onClick={() => onSelect(instructor, intervals)}
                        >
                          Auswählen
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Keine Lehrperson ist für alle Termine frei.
                </p>
              )}
            </div>

            {partialShown.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Nur teilweise verfügbar ({partialShown.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Nicht für den ganzen Plan wählbar. Tageweise Zuweisung über „Andere Zeiten suchen“.
                </p>
                <ul className="divide-y rounded-md border bg-muted/30" aria-label="Nur teilweise verfügbare Lehrpersonen">
                  {partialShown.map(({ instructor, coverage }) => (
                    <li key={instructor.id} data-testid="teacher-row-partial" className="px-3 py-2">
                      <p className="text-sm font-medium text-foreground">
                        {instructor.first_name} {instructor.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Nicht frei:{" "}
                        {coverage.blocked
                          .map((b) => `${fmtDay(b.date)} ${b.startTime}–${b.endTime} (${b.reason === "absent" ? "abwesend" : "belegt"})`)
                          .join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {classified.none > 0 && (
              <p className="text-xs text-muted-foreground">
                {classified.none} weitere {classified.none === 1 ? "Lehrperson ist" : "Lehrpersonen sind"} zu diesen Zeiten nicht verfügbar.
              </p>
            )}
          </>
        )}
        <div className="flex justify-end">{otherTimesButton}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="teacher-availability-list">
      {plan.status === "ready" && intervals.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Gewählte Termine">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {intervals.slice(0, 6).map((iv) => (
            <Badge key={`${iv.date}-${iv.startTime}`} variant="outline" className="text-xs font-normal">
              {fmtDay(iv.date)} {iv.startTime}–{iv.endTime} · {fmtHours(iv)}
            </Badge>
          ))}
          {intervals.length > 6 && <Badge variant="outline" className="text-xs">+{intervals.length - 6}</Badge>}
        </div>
      )}
      {query.length >= 2 && plan.status === "ready" && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Search className="h-3 w-3" />
          Gefiltert nach „{preferredTeacher.trim()}“
        </p>
      )}
      {body}
    </div>
  );
}

function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}
