import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GripVertical, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInYears, parseISO } from "date-fns";
import type { LivePlanningParticipant, LivePlanningGroup } from "@/hooks/useLivePlanningData";

interface ParticipantDragCardProps {
  participant: LivePlanningParticipant;
  sourceGroup: LivePlanningGroup;
}

export function ParticipantDragCard({ participant, sourceGroup }: ParticipantDragCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: participant.id,
    data: {
      participant,
      sourceGroup,
    },
    disabled: participant.hasPendingTransfer,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  const age = participant.birthDate
    ? differenceInYears(new Date(), parseISO(participant.birthDate))
    : null;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-3 flex items-center gap-3 touch-none select-none transition-all",
        isDragging && "opacity-50 shadow-lg scale-105 z-50",
        participant.hasPendingTransfer && "opacity-60 bg-muted"
      )}
      {...attributes}
      {...listeners}
    >
      {/* Drag Handle */}
      <div
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-md shrink-0",
          participant.hasPendingTransfer
            ? "bg-amber-500/20 text-amber-600"
            : "bg-muted text-muted-foreground"
        )}
      >
        {participant.hasPendingTransfer ? (
          <Clock className="h-4 w-4" />
        ) : (
          <GripVertical className="h-4 w-4" />
        )}
      </div>

      {/* Participant Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">
            {participant.firstName} {participant.lastName}
          </p>
          {participant.hasPendingTransfer && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Transfer ausstehend
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          {age !== null && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {age} Jahre
            </span>
          )}
          {participant.skillLevelName && (
            <span className="truncate">{participant.skillLevelName}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
