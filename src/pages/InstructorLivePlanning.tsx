import { useState } from "react";
import { InstructorLayout } from "@/components/instructor-portal/InstructorLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { useLivePlanningData, LivePlanningParticipant, LivePlanningGroup } from "@/hooks/useLivePlanningData";
import { useTransferRequests } from "@/hooks/useTransferRequests";
import { ParticipantDragCard } from "@/components/instructor-portal/live-planning/ParticipantDragCard";
import { GroupDropZone } from "@/components/instructor-portal/live-planning/GroupDropZone";
import { Users, Clock, MapPin, ArrowRight, RefreshCw, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInYears, parseISO } from "date-fns";
import { de } from "date-fns/locale";

export default function InstructorLivePlanning() {
  const { myGroups, otherGroups, isLoading, refetch } = useLivePlanningData();
  const { createTransfer, isCreating } = useTransferRequests();

  const [activeParticipant, setActiveParticipant] = useState<{
    participant: LivePlanningParticipant;
    sourceGroup: LivePlanningGroup;
  } | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    participant: LivePlanningParticipant | null;
    sourceGroup: LivePlanningGroup | null;
    targetGroup: LivePlanningGroup | null;
  }>({
    open: false,
    participant: null,
    sourceGroup: null,
    targetGroup: null,
  });

  // Configure sensors for touch and mouse
  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current as {
      participant: LivePlanningParticipant;
      sourceGroup: LivePlanningGroup;
    };
    setActiveParticipant(data);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { over } = event;
    setActiveParticipant(null);

    if (!over || !activeParticipant) return;

    const targetGroupId = over.id as string;
    const targetGroup = otherGroups.find((g) => g.instanceId === targetGroupId);

    if (!targetGroup) return;

    // Don't allow transfer if already pending
    if (activeParticipant.participant.hasPendingTransfer) return;

    // Open confirmation dialog
    setConfirmDialog({
      open: true,
      participant: activeParticipant.participant,
      sourceGroup: activeParticipant.sourceGroup,
      targetGroup,
    });
  };

  const handleConfirmTransfer = async () => {
    if (!confirmDialog.participant || !confirmDialog.sourceGroup || !confirmDialog.targetGroup) return;

    try {
      await createTransfer({
        sourceGroupId: confirmDialog.sourceGroup.instanceId,
        targetGroupId: confirmDialog.targetGroup.instanceId,
        participantId: confirmDialog.participant.id,
      });
    } finally {
      setConfirmDialog({ open: false, participant: null, sourceGroup: null, targetGroup: null });
    }
  };

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </InstructorLayout>
    );
  }

  const hasGroups = myGroups.length > 0;

  return (
    <InstructorLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Live Planung</h2>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "EEEE, d. MMMM", { locale: de })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Aktualisieren
          </Button>
        </div>

        {!hasGroups ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Coffee className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium">Keine Gruppen heute</p>
              <p className="text-sm text-muted-foreground mt-1">
                Du hast heute keine Gruppenleitungen.
              </p>
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* My Groups (Source) */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                MEINE GRUPPEN
              </h3>
              {myGroups.map((group) => (
                <Card key={group.instanceId} className="overflow-hidden">
                  <CardHeader
                    className="py-3 px-4"
                    style={{
                      backgroundColor: group.color ? `${group.color}20` : undefined,
                      borderLeft: group.color ? `4px solid ${group.color}` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{group.courseName}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {group.startTime?.slice(0, 5)} - {group.endTime?.slice(0, 5)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {group.participants.length}/{group.maxParticipants}
                      </span>
                      {group.meetingPoint && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {group.meetingPoint}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2">
                    {group.participants.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Keine Teilnehmer
                      </p>
                    ) : (
                      group.participants.map((participant) => (
                        <ParticipantDragCard
                          key={participant.id}
                          participant={participant}
                          sourceGroup={group}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Target Groups */}
            {otherGroups.length > 0 && (
              <div className="space-y-4 mt-8">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  TEILNEHMER VERSCHIEBEN ZU
                </h3>
                <div className="grid gap-3">
                  {otherGroups.map((group) => (
                    <GroupDropZone
                      key={group.instanceId}
                      group={group}
                      isActive={!!activeParticipant}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Drag Overlay */}
            <DragOverlay>
              {activeParticipant && (
                <div className="bg-background border-2 border-primary rounded-lg p-3 shadow-xl opacity-90">
                  <p className="font-medium">
                    {activeParticipant.participant.firstName}{" "}
                    {activeParticipant.participant.lastName}
                  </p>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          !open && setConfirmDialog({ open: false, participant: null, sourceGroup: null, targetGroup: null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer bestätigen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du{" "}
              <span className="font-semibold">
                {confirmDialog.participant?.firstName} {confirmDialog.participant?.lastName}
              </span>{" "}
              wirklich in die Gruppe{" "}
              <span className="font-semibold">
                {confirmDialog.targetGroup?.courseName}
              </span>{" "}
              von{" "}
              <span className="font-semibold">
                {confirmDialog.targetGroup?.instructorName}
              </span>{" "}
              verschieben?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmTransfer} disabled={isCreating}>
              {isCreating ? "Wird gesendet..." : "Anfrage senden"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </InstructorLayout>
  );
}
