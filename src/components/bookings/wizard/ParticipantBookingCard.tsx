import { useEffect, useMemo } from "react";
import { AlertTriangle, CalendarDays, Clock, Copy, MapPin, Users } from "lucide-react";
import { MEETING_POINTS } from "@/lib/meeting-point-utils";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

import type { ParticipantBookingDetails, SelectedParticipant } from "@/contexts/BookingWizardContext";
import { useBookableGroupCourses } from "@/hooks/useBookableGroupCourses";
import { groupCourseEmptyMessageFor, sameGroupPlan } from "@/lib/groupCoursePlan";
import { getLevelLabel } from "@/lib/level-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ParticipantBookingCardProps {
  participant: SelectedParticipant;
  booking: ParticipantBookingDetails;
  sport: "ski" | "snowboard" | null;
  onBookingChange: (booking: ParticipantBookingDetails) => void;
  onCopyToAll: () => void;
  isFirst: boolean;
  showDifferenceWarning: boolean;
}

export function ParticipantBookingCard({ participant, booking, sport, onBookingChange, onCopyToAll, isFirst, showDifferenceWarning }: ParticipantBookingCardProps) {
  const { data: courses = [], isLoading, isError, server } = useBookableGroupCourses(booking.dates, sport);
  const selected = useMemo(() => courses.find((course) => course.id === booking.groupCourseId) ?? null, [booking.groupCourseId, courses]);

  useEffect(() => {
    if (isLoading || isError || !booking.groupCourseId) return;
    if (!selected) {
      onBookingChange({ ...booking, groupCourseId: null, groupCourseName: null, groupProductName: null, groupMeetingPoint: null, groupBlocks: [], groupPersistenceBlocker: null, groupServer: null });
      return;
    }
    // Same option id but changed content (blocks/price/meeting point): refresh, never keep a stale snapshot.
    const current = { courseId: booking.groupCourseId, productName: booking.groupProductName ?? null, meetingPoint: booking.groupMeetingPoint ?? null, blocks: booking.groupBlocks ?? [], persistenceBlocker: booking.groupPersistenceBlocker ?? null, server: booking.groupServer ?? null };
    const fresh = { courseId: selected.id, productName: selected.product?.name ?? null, meetingPoint: selected.meeting_point, blocks: selected.blocks, persistenceBlocker: selected.persistenceBlocker, server: selected.server ?? null };
    if (!sameGroupPlan(current, fresh)) selectCourse(selected.id);
  }, [booking, isError, isLoading, onBookingChange, selected]);

  const selectCourse = (courseId: string) => {
    const course = courses.find((item) => item.id === courseId);
    onBookingChange({
      ...booking,
      groupCourseId: course?.id ?? null,
      productId: course?.product?.id ?? null,
      groupCourseName: course?.name ?? null,
      groupProductName: course?.product?.name ?? null,
      groupMeetingPoint: course?.meeting_point ?? null,
      // Explicit choice survives a content refresh of the same course, cleared on course change.
      groupMeetingPointChoice: course && !course.meeting_point && course.id === booking.groupCourseId ? booking.groupMeetingPointChoice ?? null : null,
      groupBlocks: course?.blocks ?? [],
      groupPersistenceBlocker: course?.persistenceBlocker ?? null,
      groupServer: course?.server ?? null,
      startTime: null,
      endTime: null,
    });
  };

  return (
    <Card className={showDifferenceWarning ? "border-warning/40" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{participant.first_name} {participant.last_name || ""}</CardTitle>
          <div className="flex flex-wrap gap-1">
            {participant.level_current_season && <Badge variant="secondary">Niveau: {getLevelLabel(participant.level_current_season)}</Badge>}
            <Badge variant="outline">{sport === "snowboard" ? "🏂 Snowboard" : "⛷️ Ski"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-3 w-3" />Kurs</Label>
          <Select value={booking.groupCourseId || ""} onValueChange={selectCourse} disabled={isLoading || isError || courses.length === 0}>
            <SelectTrigger className="control-target" data-course-select aria-label={`Kurs für ${participant.first_name}`}><SelectValue placeholder={isLoading ? "Kurse laden…" : "Kurs wählen"} /></SelectTrigger>
            <SelectContent>{courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name} · {course.product?.name}</SelectItem>)}</SelectContent>
          </Select>
          {isError && <p role="alert" className="text-sm text-destructive">Kurse konnten nicht geladen werden.</p>}
          {!isLoading && !isError && courses.length === 0 && <p className="text-sm text-muted-foreground">{groupCourseEmptyMessageFor(booking.dates, sport, server)}</p>}
        </div>
        {selected && <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
          {booking.dates.slice().sort().map((date) => <div key={date} className="flex flex-wrap gap-x-2"><span className="flex min-w-28 items-center gap-1 font-medium"><CalendarDays className="h-3.5 w-3.5" />{format(parseISO(date), "EEE, dd.MM.", { locale: de })}</span>{selected.blocks.filter((block) => block.date === date).map((block) => <span key={`${date}-${block.startTime}`} className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" />{block.startTime}–{block.endTime}</span>)}</div>)}
          {!selected.meeting_point ? (
            <div className="mt-2 space-y-1">
              <Label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><MapPin className="h-3 w-3" />Treffpunkt (im Kurs nicht hinterlegt)</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Treffpunkt für ${participant.first_name}`}>
                {MEETING_POINTS.map((point) => (
                  <Button key={point.id} type="button" role="radio" aria-checked={booking.groupMeetingPointChoice === point.id} variant={booking.groupMeetingPointChoice === point.id ? "secondary" : "outline"} size="sm" className="control-target h-9 text-xs" onClick={() => onBookingChange({ ...booking, groupMeetingPointChoice: point.id })}>
                    {point.name.replace("Sammelplatz ", "").replace("Kasse ", "")}
                  </Button>
                ))}
              </div>
            </div>
          ) : <div className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{selected.meeting_point}</div>}
          {selected.persistenceBlocker && <Alert variant="destructive" className="mt-2 py-2"><AlertTriangle className="h-4 w-4" /><AlertDescription>{selected.persistenceBlocker}</AlertDescription></Alert>}
        </div>}
        {!isFirst && <Button variant="ghost" size="sm" onClick={onCopyToAll}><Copy className="mr-1 h-3.5 w-3.5" />Kurs des ersten Teilnehmers übernehmen</Button>}
      </CardContent>
    </Card>
  );
}
