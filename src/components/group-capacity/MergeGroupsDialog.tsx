import { useState, useEffect, useMemo } from 'react';
import { Info, Loader2, AlertTriangle, Users } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useMergeGroups, type GroupCapacityInfo } from '@/hooks/useGroupCapacityData';
import { toast } from 'sonner';

interface MergeGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupCapacityInfo | null;
  allGroups: GroupCapacityInfo[];
  instructors: Array<{ id: string; first_name: string; last_name: string }>;
  weekStart: Date;
}

// Define which skill levels are compatible for merging
function areSkillLevelsCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // If either has no level, allow merge
  if (a === b) return true;
  // TODO: Define actual level ranges if needed (e.g. Blue Prince + Blue King)
  return true;
}

function getDisplayName(g: GroupCapacityInfo): string {
  return g.customName || (g.groupNumber > 1 ? `${g.courseName} ${g.groupNumber}` : g.courseName);
}

export function MergeGroupsDialog({
  open,
  onOpenChange,
  group,
  allGroups,
  instructors,
  weekStart,
}: MergeGroupsDialogProps) {
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [instructorId, setInstructorId] = useState<string>('');
  const [assistantId, setAssistantId] = useState<string>('');

  const mergeMutation = useMergeGroups();

  // Compute compatible groups
  const compatibleGroups = useMemo(() => {
    if (!group) return [];
    const sourceId = group.id || group.courseId;
    return allGroups.filter(g => {
      const gId = g.id || g.courseId;
      if (gId === sourceId) return false;
      if (g.status !== 'active') return false;
      // Same discipline
      if (g.discipline !== group.discipline) return false;
      // Compatible skill level
      if (!areSkillLevelsCompatible(g.skillLevelId, group.skillLevelId)) return false;
      // Same week
      if (g.weekStart !== group.weekStart) return false;
      return true;
    });
  }, [group, allGroups]);

  // Selected target group object
  const targetGroup = useMemo(
    () => compatibleGroups.find(g => (g.id || g.courseId) === targetGroupId) || null,
    [compatibleGroups, targetGroupId]
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (group && open) {
      setTargetGroupId('');
      setInstructorId(group.instructorId || '');
      setAssistantId('');
      setNewGroupName('');
    }
  }, [group, open]);

  // Auto-generate name when target changes
  useEffect(() => {
    if (group && targetGroup) {
      const sourceName = getDisplayName(group);
      const targetName = getDisplayName(targetGroup);
      setNewGroupName(`${sourceName} / ${targetName}`);
    }
  }, [group, targetGroup]);

  const totalParticipants = (group?.participantCount || 0) + (targetGroup?.participantCount || 0);
  const maxParticipants = Math.max(group?.maxParticipants || 12, targetGroup?.maxParticipants || 12);
  const isOverCapacity = totalParticipants > maxParticipants;

  // Collect instructors from both groups for quick selection
  const relevantInstructorIds = useMemo(() => {
    const ids = new Set<string>();
    if (group?.instructorId) ids.add(group.instructorId);
    if (targetGroup?.instructorId) ids.add(targetGroup.instructorId);
    return ids;
  }, [group, targetGroup]);

  const handleMerge = async () => {
    if (!group || !targetGroupId) return;

    const sourceId = group.id || group.courseId;

    try {
      await mergeMutation.mutateAsync({
        sourceGroupIds: [sourceId, targetGroupId],
        targetGroupId: sourceId, // Use source as the base target
        newGroupName: newGroupName || undefined,
        instructorId: instructorId || undefined,
        assistantInstructorId: assistantId || undefined,
      });
      toast.success('Gruppen erfolgreich zusammengelegt');
      onOpenChange(false);
    } catch (err) {
      toast.error('Fehler beim Zusammenlegen der Gruppen');
    }
  };

  if (!group) return null;

  const sourceName = getDisplayName(group);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gruppe &quot;{sourceName}&quot; zusammenlegen</DialogTitle>
          <DialogDescription>
            Wähle eine kompatible Gruppe zum Zusammenlegen.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5">
            {/* Section 1: Source Group (Read-Only) */}
            <div>
              <Label className="mb-2 block text-muted-foreground text-xs uppercase tracking-wide">Ausgangsgruppe</Label>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: group.courseColor }}
                    />
                    <span className="font-medium">{sourceName}</span>
                    <Badge variant="secondary" className="ml-auto">
                      <Users className="h-3 w-3 mr-1" />
                      {group.participantCount} TN
                    </Badge>
                  </div>
                  {group.instructorName && (
                    <p className="text-sm text-muted-foreground mt-1 ml-5">
                      Lehrer: {group.instructorName}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Section 2: Select Target Group */}
            <div>
              <Label className="mb-2 block">Zusammenlegen mit:</Label>
              {compatibleGroups.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Keine kompatiblen Gruppen gefunden (gleiche Disziplin, gleiche Woche).
                  </AlertDescription>
                </Alert>
              ) : (
                <RadioGroup
                  value={targetGroupId}
                  onValueChange={setTargetGroupId}
                  className="space-y-2"
                >
                  {compatibleGroups.map(g => {
                    const gId = g.id || g.courseId;
                    const name = getDisplayName(g);
                    return (
                      <div key={gId} className="flex items-center gap-3 p-2 rounded-md border hover:bg-accent/50 transition-colors">
                        <RadioGroupItem value={gId} id={`merge-${gId}`} />
                        <label htmlFor={`merge-${gId}`} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: g.courseColor }}
                            />
                            <span className="font-medium">{name}</span>
                            <span className="text-sm text-muted-foreground">
                              ({g.participantCount} TN)
                            </span>
                          </div>
                          {g.instructorName && (
                            <p className="text-xs text-muted-foreground ml-4">
                              Lehrer: {g.instructorName}
                            </p>
                          )}
                        </label>
                      </div>
                    );
                  })}
                </RadioGroup>
              )}
            </div>

            {/* Section 3: New Merged Group (only when target selected) */}
            {targetGroup && (
              <>
                <Separator />
                <div className="space-y-4">
                  <Label className="mb-1 block text-muted-foreground text-xs uppercase tracking-wide">Neue zusammengelegte Gruppe</Label>

                  {/* Group Name */}
                  <div>
                    <Label className="mb-1 block">Neuer Gruppenname</Label>
                    <Input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="z.B. Blau Kombi"
                    />
                  </div>

                  {/* Instructor */}
                  <div>
                    <Label className="mb-1 block">Lehrer</Label>
                    <Select
                      value={instructorId || 'none'}
                      onValueChange={(v) => setInstructorId(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Lehrer wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kein Lehrer</SelectItem>
                        {instructors.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.first_name} {inst.last_name}
                            {relevantInstructorIds.has(inst.id) ? ' ★' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assistant Instructor */}
                  <div>
                    <Label className="mb-1 block">Hilfslehrer (optional)</Label>
                    <Select
                      value={assistantId || 'none'}
                      onValueChange={(v) => setAssistantId(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Hilfslehrer wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kein Hilfslehrer</SelectItem>
                        {instructors
                          .filter(inst => inst.id !== instructorId)
                          .map(inst => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.first_name} {inst.last_name}
                              {relevantInstructorIds.has(inst.id) ? ' ★' : ''}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Participant Preview */}
                  <div>
                    <Label className="mb-1 block">Vorschau Teilnehmer</Label>
                    <Card>
                      <CardContent className="p-3">
                        <p className="text-sm font-medium">
                          {group.participantCount} + {targetGroup.participantCount} = {totalParticipants} Teilnehmer
                        </p>
                        {isOverCapacity && (
                          <div className="flex items-center gap-1.5 mt-2 text-destructive text-sm">
                            <AlertTriangle className="h-4 w-4" />
                            <span>Überschreitet Maximum ({maxParticipants} TN)</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Die ursprünglichen Gruppen werden als &quot;zusammengelegt&quot; markiert.
              </AlertDescription>
            </Alert>
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleMerge}
            disabled={mergeMutation.isPending || !targetGroupId}
          >
            {mergeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Zusammenlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
