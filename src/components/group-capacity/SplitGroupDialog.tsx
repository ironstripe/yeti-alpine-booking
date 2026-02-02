import { useState, useEffect } from 'react';
import { ArrowUpDown, Plus, Loader2, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSplitGroup, type GroupCapacityInfo, type GroupParticipant } from '@/hooks/useGroupCapacityData';
import { toast } from 'sonner';

interface SplitGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupCapacityInfo | null;
  instructors: Array<{ id: string; first_name: string; last_name: string }>;
  weekStart: Date;
}

interface SplitGroup {
  groupNumber: number;
  customName: string;
  instructorId: string | null;
  participants: GroupParticipant[];
}

function SortableParticipant({ participant, groupIndex }: { participant: GroupParticipant; groupIndex: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${groupIndex}-${participant.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 bg-background border rounded",
        isDragging && "opacity-50 shadow-lg"
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
      <span className="flex-1 font-medium text-sm">
        {participant.firstName} {participant.lastName}
      </span>
      <span className="text-sm text-muted-foreground">
        {participant.age} J.
      </span>
    </div>
  );
}

export function SplitGroupDialog({
  open,
  onOpenChange,
  group,
  instructors,
  weekStart,
}: SplitGroupDialogProps) {
  const [splitGroups, setSplitGroups] = useState<SplitGroup[]>([]);
  const splitMutation = useSplitGroup();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Initialize split groups when dialog opens
  useEffect(() => {
    if (group && open) {
      const participants = group.participants;
      const numGroups = Math.ceil(participants.length / group.maxParticipants);
      
      const initialGroups: SplitGroup[] = Array.from({ length: Math.max(numGroups, 2) }, (_, i) => ({
        groupNumber: i + 1,
        customName: '',
        instructorId: i === 0 ? group.instructorId : null,
        participants: [],
      }));

      // Distribute participants evenly
      participants.forEach((p, index) => {
        const groupIndex = index % initialGroups.length;
        initialGroups[groupIndex].participants.push(p);
      });

      setSplitGroups(initialGroups);
    }
  }, [group, open]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const activeIdParts = (active.id as string).split('-');
    const overIdParts = (over.id as string).split('-');
    
    const sourceGroupIndex = parseInt(activeIdParts[0]);
    const targetGroupIndex = parseInt(overIdParts[0]);
    const participantId = activeIdParts.slice(1).join('-');

    setSplitGroups(prev => {
      const newGroups = prev.map(g => ({ ...g, participants: [...g.participants] }));
      
      // Find and remove participant from source
      const participantIndex = newGroups[sourceGroupIndex].participants.findIndex(
        p => p.id === participantId
      );
      
      if (participantIndex === -1) return prev;
      
      const [participant] = newGroups[sourceGroupIndex].participants.splice(participantIndex, 1);
      
      // Add to target
      newGroups[targetGroupIndex].participants.push(participant);
      
      return newGroups;
    });
  };

  const distributeByAge = () => {
    if (!group) return;
    
    const sorted = [...group.participants].sort(
      (a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime()
    );

    setSplitGroups(prev => {
      const newGroups = prev.map(g => ({ ...g, participants: [] as GroupParticipant[] }));
      sorted.forEach((participant, index) => {
        const groupIndex = index % newGroups.length;
        newGroups[groupIndex].participants.push(participant);
      });
      return newGroups;
    });
  };

  const addGroup = () => {
    setSplitGroups(prev => [
      ...prev,
      {
        groupNumber: prev.length + 1,
        customName: '',
        instructorId: null,
        participants: [],
      },
    ]);
  };

  const handleSave = async () => {
    if (!group?.id) {
      toast.error('Gruppe muss zuerst generiert werden');
      return;
    }

    try {
      await splitMutation.mutateAsync({
        sourceGroupId: group.id,
        newGroups: splitGroups.map(sg => ({
          group_number: sg.groupNumber,
          custom_name: sg.customName || null,
          instructor_id: sg.instructorId,
          participant_ids: sg.participants.map(p => p.id),
        })),
      });
      toast.success('Gruppe erfolgreich aufgeteilt');
      onOpenChange(false);
    } catch (err) {
      toast.error('Fehler beim Aufteilen der Gruppe');
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{group.courseName} aufteilen</DialogTitle>
          <DialogDescription>
            {group.participantCount} Teilnehmer auf {splitGroups.length} Gruppen verteilen 
            (max. {group.maxParticipants} pro Gruppe)
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button variant="outline" onClick={distributeByAge}>
            <ArrowUpDown className="mr-2 h-4 w-4" />
            Nach Alter verteilen
          </Button>
          <Button variant="outline" onClick={addGroup}>
            <Plus className="mr-2 h-4 w-4" />
            Gruppe hinzufügen
          </Button>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {splitGroups.map((splitGroup, groupIndex) => (
                <Card key={groupIndex} className="flex flex-col">
                  <CardHeader className="pb-2 space-y-2">
                    <Input
                      value={splitGroup.customName}
                      onChange={(e) => {
                        setSplitGroups(prev => {
                          const newGroups = [...prev];
                          newGroups[groupIndex] = { 
                            ...newGroups[groupIndex], 
                            customName: e.target.value 
                          };
                          return newGroups;
                        });
                      }}
                      placeholder={`${group.courseName} ${splitGroup.groupNumber}`}
                      className="font-semibold"
                    />
                    <Select
                      value={splitGroup.instructorId || 'none'}
                      onValueChange={(value) => {
                        setSplitGroups(prev => {
                          const newGroups = [...prev];
                          newGroups[groupIndex] = { 
                            ...newGroups[groupIndex], 
                            instructorId: value === 'none' ? null : value 
                          };
                          return newGroups;
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Lehrer wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kein Lehrer</SelectItem>
                        {instructors.map(instructor => (
                          <SelectItem key={instructor.id} value={instructor.id}>
                            {instructor.first_name} {instructor.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <SortableContext
                      items={splitGroup.participants.map(p => `${groupIndex}-${p.id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="min-h-[150px] space-y-1 p-2 rounded border-2 border-dashed bg-muted/30">
                        {splitGroup.participants.map(participant => (
                          <SortableParticipant
                            key={participant.id}
                            participant={participant}
                            groupIndex={groupIndex}
                          />
                        ))}
                        {splitGroup.participants.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-8">
                            Teilnehmer hierher ziehen
                          </p>
                        )}
                      </div>
                    </SortableContext>
                    <p className={cn(
                      "text-sm mt-2 text-center",
                      splitGroup.participants.length > group.maxParticipants && "text-orange-600 font-medium"
                    )}>
                      {splitGroup.participants.length}/{group.maxParticipants} Teilnehmer
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DndContext>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={splitMutation.isPending}>
            {splitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
