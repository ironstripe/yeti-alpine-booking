import { useEffect, useMemo } from "react";
import { AlertTriangle, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

import { useBookableGroupCourses } from "@/hooks/useBookableGroupCourses";
import { groupCourseEmptyMessageFor } from "@/lib/groupCoursePlan";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Participant { id: string; first_name: string; last_name?: string | null }
interface GroupSelectorProps {
  selectedDates: string[];
  sport: "ski" | "snowboard" | null;
  participants?: Participant[];
  selectedGroupId: string | null;
  onGroupSelect: (groupId: string | null) => void;
  onMeetingPointChange?: (meetingPoint: string | null) => void;
}

export function GroupSelector({ selectedDates, sport, participants = [], selectedGroupId, onGroupSelect, onMeetingPointChange }: GroupSelectorProps) {
  const { data: courses = [], isLoading, isError, server } = useBookableGroupCourses(selectedDates, sport);
  const selectedCourse = useMemo(() => courses.find((course) => course.id === selectedGroupId) ?? null, [courses, selectedGroupId]);

  useEffect(() => {
    if (isLoading || isError || !selectedGroupId) return;
    if (!courses.some((course) => course.id === selectedGroupId)) onGroupSelect(null);
  }, [courses, isError, isLoading, onGroupSelect, selectedGroupId]);

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Users className="h-3 w-3" />Kurs
      </Label>
      <Select value={selectedGroupId || ""} onValueChange={(value) => {
        const course = courses.find((item) => item.id === value);
        onGroupSelect(value || null);
        if (course && onMeetingPointChange) onMeetingPointChange(course.meeting_point);
      }} disabled={isLoading || isError || courses.length === 0}>
        <SelectTrigger className="control-target" aria-label="Kurs auswählen" data-course-select>
          <SelectValue placeholder={isLoading ? "Kurse laden…" : "Kurs wählen"} />
        </SelectTrigger>
        <SelectContent>
          {courses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{course.name}</span>
                <Badge variant="outline" className="shrink-0 text-[10px]">max. {course.max_participants}</Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isError && <p role="alert" className="text-sm text-destructive">Kurse konnten nicht geladen werden. Bitte erneut versuchen.</p>}
      {!isLoading && !isError && courses.length === 0 && <p role="status" tabIndex={-1} data-course-status className="rounded-md border border-dashed p-3 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">{groupCourseEmptyMessageFor(selectedDates, sport, server)}</p>}

      {selectedCourse && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{selectedCourse.name}</p>
            {selectedCourse.product && <Badge variant="secondary">{selectedCourse.product.name}</Badge>}
          </div>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {selectedDates.slice().sort().map((date) => (
              <div key={date} className="flex flex-wrap items-start gap-x-2">
                <span className="flex min-w-28 items-center gap-1 font-medium text-foreground"><CalendarDays className="h-3.5 w-3.5" />{format(parseISO(date), "EEE, dd.MM.", { locale: de })}</span>
                <span className="flex flex-wrap gap-2">
                  {selectedCourse.blocks.filter((block) => block.date === date).map((block) => (
                    <span key={`${block.date}-${block.startTime}-${block.endTime}`} className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{block.startTime}–{block.endTime}</span>
                  ))}
                </span>
              </div>
            ))}
            {selectedCourse.meeting_point && <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />Treffpunkt: {selectedCourse.meeting_point}</p>}
          </div>
          {selectedCourse.persistenceBlocker && (
            <Alert variant="destructive" className="py-2"><AlertTriangle className="h-4 w-4" /><AlertDescription>{selectedCourse.persistenceBlocker}</AlertDescription></Alert>
          )}
          {participants.length > selectedCourse.max_participants && (
            <p className="text-xs text-muted-foreground">Planungshinweis: {participants.length} Teilnehmer bei maximal {selectedCourse.max_participants} laut Kursstamm. Die Auswahl bleibt möglich.</p>
          )}
        </div>
      )}
    </div>
  );
}
