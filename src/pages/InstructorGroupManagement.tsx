import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Users, Calendar, Loader2, AlertCircle } from "lucide-react";
import { format, parseISO, isToday } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { ParticipantManagementCard } from "@/components/instructor-portal/ParticipantManagementCard";
import { useGroupLeaderData } from "@/hooks/useGroupLeaderData";
import { getMeetingPointById } from "@/lib/meeting-point-utils";
import type { Discipline } from "@/types/skill-levels";

export default function InstructorGroupManagement() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const { data: group, isLoading, error } = useGroupLeaderData(instanceId);

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Gruppe laden...</p>
        </div>
      </InstructorLayout>
    );
  }

  if (error || !group) {
    return (
      <InstructorLayout>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Zugriff verweigert</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {error?.message || "Die Gruppe konnte nicht geladen werden."}
          </p>
          <Button variant="outline" onClick={() => navigate("/instructor")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück zur Übersicht
          </Button>
        </div>
      </InstructorLayout>
    );
  }

  // Calculate today's attendance summary
  const todayInstance = group.instances.find((i) => isToday(parseISO(i.date)));
  const todayAttendance = todayInstance
    ? group.participants.reduce(
        (acc, p) => {
          const att = p.attendance.find((a) => a.date === todayInstance.date);
          if (att?.status === "present") acc.present++;
          else if (att?.status === "absent") acc.absent++;
          else acc.pending++;
          return acc;
        },
        { present: 0, absent: 0, pending: 0 }
      )
    : null;

  const meetingPoint = group.meetingPoint
    ? getMeetingPointById(group.meetingPoint)?.name || group.meetingPoint
    : null;

  return (
    <InstructorLayout>
      {/* Header with Back Button */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/instructor")}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Zurück
        </Button>
        {meetingPoint && (
          <Badge variant="outline" className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {meetingPoint}
          </Badge>
        )}
      </div>

      {/* Course Info */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{group.courseName}</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
          <Calendar className="h-4 w-4" />
          <span>
            {format(parseISO(group.periodStart), "d. MMM", { locale: de })} -{" "}
            {format(parseISO(group.periodEnd), "d. MMM yyyy", { locale: de })}
          </span>
          <span>·</span>
          <Users className="h-4 w-4" />
          <span>{group.participants.length} Teilnehmer</span>
        </div>
      </div>

      {/* Today's Summary */}
      {todayAttendance && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Heute
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-2xl font-bold text-green-600">
                  {todayAttendance.present}
                </p>
                <p className="text-xs text-muted-foreground">Anwesend</p>
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-destructive">
                  {todayAttendance.absent}
                </p>
                <p className="text-xs text-muted-foreground">Abwesend</p>
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold text-muted-foreground">
                  {todayAttendance.pending}
                </p>
                <p className="text-xs text-muted-foreground">Offen</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Participants List */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Teilnehmer
        </h3>
        {group.participants.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Keine Teilnehmer angemeldet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {group.participants.map((participant) => (
              <ParticipantManagementCard
                key={participant.id}
                participant={participant}
                instances={group.instances}
                discipline={group.discipline as Discipline}
                instanceId={instanceId!}
              />
            ))}
          </div>
        )}
      </div>
    </InstructorLayout>
  );
}
