import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Check, X, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttendanceGrid } from "./AttendanceGrid";
import { SkillLevelSelect } from "./SkillLevelSelect";
import { useUpdateAttendance } from "@/hooks/useUpdateAttendance";
import { useUpdateParticipantLevel } from "@/hooks/useUpdateParticipantLevel";
import { useUpdateParticipantNotes } from "@/hooks/useUpdateParticipantNotes";
import { useSkillLevel } from "@/hooks/useSkillLevels";
import type { GroupParticipant, GroupInstance } from "@/hooks/useGroupLeaderData";
import type { Discipline, TargetGroup } from "@/types/skill-levels";

interface ParticipantManagementCardProps {
  participant: GroupParticipant;
  instances: GroupInstance[];
  discipline: Discipline;
  instanceId: string;
}

export function ParticipantManagementCard({
  participant,
  instances,
  discipline,
  instanceId,
}: ParticipantManagementCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState(participant.notes || "");
  const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false);

  const updateAttendance = useUpdateAttendance(instanceId);
  const updateLevel = useUpdateParticipantLevel(instanceId);
  const updateNotes = useUpdateParticipantNotes(instanceId);

  // Determine target group based on age
  const targetGroup: TargetGroup = participant.age < 16 ? "child" : "adult";

  // Get current level ID based on discipline
  const currentLevelId =
    discipline === "ski"
      ? participant.currentSkiLevelId
      : participant.currentSnowboardLevelId;

  // Fetch current level details
  const { data: currentLevel } = useSkillLevel(currentLevelId);

  // Calculate attendance summary
  const presentCount = participant.attendance.filter((a) => a.status === "present").length;
  const absentCount = participant.attendance.filter((a) => a.status === "absent").length;
  const pendingCount = participant.attendance.filter((a) => a.status === "registered").length;

  const handleAttendanceToggle = (enrollmentId: string, newStatus: string) => {
    updateAttendance.mutate({
      enrollmentId,
      status: newStatus as "present" | "absent" | "registered",
    });
  };

  const handleLevelChange = (levelId: string) => {
    updateLevel.mutate({
      participantId: participant.id,
      discipline,
      levelId,
    });
  };

  const handleSaveNotes = () => {
    updateNotes.mutate(
      { participantId: participant.id, notes },
      {
        onSuccess: () => {
          setHasUnsavedNotes(false);
        },
      }
    );
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasUnsavedNotes(value !== (participant.notes || ""));
  };

  const getInitials = () => {
    const first = participant.firstName.charAt(0).toUpperCase();
    const last = participant.lastName?.charAt(0).toUpperCase() || "";
    return first + last;
  };

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {participant.firstName} {participant.lastName}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{participant.age} Jahre</span>
                    {currentLevel && (
                      <>
                        <span>·</span>
                        <Badge variant="outline" className="text-xs">
                          {currentLevel.name}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Compact attendance summary */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {presentCount > 0 && (
                  <div className="flex items-center gap-0.5 text-green-600">
                    <Check className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{presentCount}</span>
                  </div>
                )}
                {absentCount > 0 && (
                  <div className="flex items-center gap-0.5 text-destructive">
                    <X className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">{absentCount}</span>
                  </div>
                )}
                {pendingCount > 0 && (
                  <div className="flex items-center gap-0.5 text-muted-foreground">
                    <Circle className="h-3 w-3" />
                    <span className="text-xs font-medium">{pendingCount}</span>
                  </div>
                )}
                <ChevronDown
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform ml-1",
                    isOpen && "rotate-180"
                  )}
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
            {/* Attendance Grid */}
            <div className="pt-4">
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Anwesenheit
              </h4>
              <AttendanceGrid
                instances={instances}
                attendance={participant.attendance}
                onToggle={handleAttendanceToggle}
                disabled={updateAttendance.isPending}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Tippen zum Ändern: Offen → Anwesend → Abwesend
              </p>
            </div>

            {/* Skill Level */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Erreichtes Level
              </h4>
              <SkillLevelSelect
                discipline={discipline}
                targetGroup={targetGroup}
                value={currentLevelId}
                onChange={handleLevelChange}
                disabled={updateLevel.isPending}
              />
            </div>

            {/* Notes */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Notizen
              </h4>
              <Textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Notizen zum Teilnehmer..."
                className="min-h-[80px] resize-none"
              />
              {hasUnsavedNotes && (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={handleSaveNotes}
                  disabled={updateNotes.isPending}
                >
                  {updateNotes.isPending ? "Speichern..." : "Notizen speichern"}
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
