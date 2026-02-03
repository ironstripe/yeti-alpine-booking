import { useDroppable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MapPin, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LivePlanningGroup } from "@/hooks/useLivePlanningData";

interface GroupDropZoneProps {
  group: LivePlanningGroup;
  isActive: boolean;
}

export function GroupDropZone({ group, isActive }: GroupDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: group.instanceId,
  });

  const isFull = group.currentParticipants >= group.maxParticipants;

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "transition-all duration-200",
        isActive && !isFull && "ring-2 ring-primary ring-offset-2",
        isOver && !isFull && "bg-primary/10 ring-2 ring-primary scale-[1.02]",
        isFull && "opacity-50"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold truncate">{group.courseName}</p>
              <Badge
                variant={isFull ? "destructive" : "secondary"}
                className="shrink-0"
              >
                {group.currentParticipants}/{group.maxParticipants}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {group.startTime?.slice(0, 5)} - {group.endTime?.slice(0, 5)}
              </span>
              {group.instructorName && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {group.instructorName}
                </span>
              )}
              {group.meetingPoint && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {group.meetingPoint}
                </span>
              )}
            </div>

            {isFull && (
              <p className="text-xs text-destructive mt-2">Gruppe ist voll</p>
            )}
          </div>

          {/* Drop indicator */}
          {isActive && !isFull && (
            <div
              className={cn(
                "h-12 w-12 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                isOver ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              <Users className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
