import { useState, useEffect } from 'react';
import { Info, Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
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

export function MergeGroupsDialog({
  open,
  onOpenChange,
  group,
  allGroups,
  instructors,
  weekStart,
}: MergeGroupsDialogProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [targetOption, setTargetOption] = useState<'existing' | 'new'>('new');
  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [instructorId, setInstructorId] = useState<string>('');
  
  const mergeMutation = useMergeGroups();

  // Initialize with current group selected
  useEffect(() => {
    if (group && open) {
      const groupId = group.id || group.courseId;
      setSelectedGroupIds([groupId]);
      setNewGroupName(`${group.courseName} Kombi`);
      setInstructorId(group.instructorId || '');
    }
  }, [group, open]);

  const activeGroups = allGroups.filter(g => g.status === 'active');
  
  const selectedGroups = activeGroups.filter(g => 
    selectedGroupIds.includes(g.id || g.courseId)
  );
  
  const totalParticipants = selectedGroups.reduce(
    (sum, g) => sum + g.participantCount, 
    0
  );

  const availableTargetGroups = activeGroups.filter(
    g => !selectedGroupIds.includes(g.id || g.courseId)
  );

  const handleGroupToggle = (groupId: string, checked: boolean) => {
    if (checked) {
      setSelectedGroupIds(prev => [...prev, groupId]);
    } else {
      setSelectedGroupIds(prev => prev.filter(id => id !== groupId));
    }
  };

  const handleMerge = async () => {
    if (selectedGroupIds.length < 2) {
      toast.error('Mindestens 2 Gruppen müssen ausgewählt sein');
      return;
    }

    const actualTargetId = targetOption === 'existing' 
      ? targetGroupId 
      : selectedGroupIds[0]; // Use first selected as target for new

    if (!actualTargetId) {
      toast.error('Bitte Zielgruppe auswählen');
      return;
    }

    try {
      await mergeMutation.mutateAsync({
        sourceGroupIds: selectedGroupIds,
        targetGroupId: actualTargetId,
        newGroupName: targetOption === 'new' ? newGroupName : undefined,
        instructorId: instructorId || undefined,
      });
      toast.success('Gruppen erfolgreich zusammengelegt');
      onOpenChange(false);
    } catch (err) {
      toast.error('Fehler beim Zusammenlegen der Gruppen');
    }
  };

  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gruppen zusammenlegen</DialogTitle>
          <DialogDescription>
            Wähle die Gruppen aus, die zusammengelegt werden sollen.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6">
            {/* Select groups to merge */}
            <div>
              <Label className="mb-2 block">Gruppen auswählen</Label>
              <div className="space-y-2">
                {activeGroups.map(g => {
                  const groupId = g.id || g.courseId;
                  const displayName = g.customName || 
                    (g.groupNumber > 1 ? `${g.courseName} ${g.groupNumber}` : g.courseName);
                  
                  return (
                    <div key={groupId} className="flex items-center gap-3">
                      <Checkbox
                        id={groupId}
                        checked={selectedGroupIds.includes(groupId)}
                        onCheckedChange={(checked) => 
                          handleGroupToggle(groupId, checked as boolean)
                        }
                      />
                      <label htmlFor={groupId} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: g.courseColor }}
                          />
                          <span className="font-medium">{displayName}</span>
                          <span className="text-muted-foreground">
                            ({g.participantCount} TN)
                          </span>
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Target selection */}
            <div>
              <Label className="mb-2 block">Zusammenlegen in</Label>
              <RadioGroup 
                value={targetOption} 
                onValueChange={(v) => setTargetOption(v as 'existing' | 'new')}
                className="space-y-3"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="new" id="new" className="mt-1" />
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="new">Neue Kombi-Gruppe:</Label>
                    <Input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="z.B. Blau-Rot Kombi"
                      disabled={targetOption !== 'new'}
                    />
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="existing" id="existing" className="mt-1" />
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="existing">Bestehende Gruppe:</Label>
                    <Select
                      value={targetGroupId}
                      onValueChange={setTargetGroupId}
                      disabled={targetOption !== 'existing'}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Gruppe wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTargetGroups.map(g => {
                          const displayName = g.customName || 
                            (g.groupNumber > 1 ? `${g.courseName} ${g.groupNumber}` : g.courseName);
                          return (
                            <SelectItem key={g.id || g.courseId} value={g.id || g.courseId}>
                              {displayName} ({g.participantCount} TN)
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Instructor */}
            <div>
              <Label className="mb-2 block">Lehrer</Label>
              <Select value={instructorId} onValueChange={setInstructorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Lehrer wählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Kein Lehrer</SelectItem>
                  {instructors.map(instructor => (
                    <SelectItem key={instructor.id} value={instructor.id}>
                      {instructor.first_name} {instructor.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Preview */}
            <div>
              <Label className="mb-2 block">Vorschau</Label>
              <Card>
                <CardContent className="p-4">
                  <p className="font-medium mb-2">
                    {targetOption === 'new' 
                      ? (newGroupName || 'Neue Gruppe')
                      : availableTargetGroups.find(g => (g.id || g.courseId) === targetGroupId)?.courseName || 'Zielgruppe'
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {totalParticipants} Teilnehmer aus {selectedGroupIds.length} Gruppen
                  </p>
                  {selectedGroups.length > 0 && (
                    <ul className="text-sm mt-2 space-y-1">
                      {selectedGroups.slice(0, 5).flatMap(g => 
                        g.participants.slice(0, 2).map(p => (
                          <li key={p.id} className="flex justify-between text-muted-foreground">
                            <span>{p.firstName} {p.lastName}</span>
                            <span className="text-xs">(urspr. {g.courseName})</span>
                          </li>
                        ))
                      )}
                      {totalParticipants > 10 && (
                        <li className="text-muted-foreground">
                          ... und {totalParticipants - 10} weitere
                        </li>
                      )}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Die ursprünglichen Gruppen werden für diese Woche als "zusammengelegt" markiert.
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
            disabled={mergeMutation.isPending || selectedGroupIds.length < 2}
          >
            {mergeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Zusammenlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
