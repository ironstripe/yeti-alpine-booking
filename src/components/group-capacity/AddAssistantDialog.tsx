import { useState, useEffect } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAssignAssistant, type GroupCapacityInfo } from '@/hooks/useGroupCapacityData';
import { toast } from 'sonner';

interface AddAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupCapacityInfo | null;
  instructors: Array<{ id: string; first_name: string; last_name: string }>;
}

export function AddAssistantDialog({
  open,
  onOpenChange,
  group,
  instructors,
}: AddAssistantDialogProps) {
  const [assistantId, setAssistantId] = useState<string>('');
  const assignMutation = useAssignAssistant();

  useEffect(() => {
    if (group && open) {
      setAssistantId(group.assistantId || '');
    }
  }, [group, open]);

  const handleSave = async () => {
    if (!group?.id) {
      toast.error('Gruppe muss zuerst generiert werden');
      return;
    }

    try {
      await assignMutation.mutateAsync({
        groupId: group.id,
        assistantInstructorId: assistantId || null,
      });
      toast.success(assistantId ? 'Hilfslehrer zugewiesen' : 'Hilfslehrer entfernt');
      onOpenChange(false);
    } catch (err) {
      toast.error('Fehler beim Zuweisen des Hilfslehrers');
    }
  };

  // Filter out the main instructor
  const availableInstructors = instructors.filter(
    i => i.id !== group?.instructorId
  );

  if (!group) return null;

  const displayName = group.customName || 
    (group.groupNumber > 1 ? `${group.courseName} ${group.groupNumber}` : group.courseName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hilfslehrer zuweisen</DialogTitle>
          <DialogDescription>
            Weise einen Hilfslehrer für "{displayName}" zu, um die überbuchte Gruppe zu betreuen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <div 
              className="w-3 h-10 rounded"
              style={{ backgroundColor: group.courseColor }}
            />
            <div>
              <p className="font-medium">{displayName}</p>
              <p className="text-sm text-muted-foreground">
                {group.participantCount} Teilnehmer (max. {group.maxParticipants})
              </p>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Hauptlehrer</Label>
            <p className="text-sm text-muted-foreground border rounded-md p-2">
              {group.instructorName || 'Kein Lehrer zugewiesen'}
            </p>
          </div>

          <div>
            <Label className="mb-2 block">Hilfslehrer</Label>
            <Select 
              value={assistantId || "none"} 
              onValueChange={(v) => setAssistantId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Hilfslehrer wählen..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Hilfslehrer</SelectItem>
                {availableInstructors.map(instructor => (
                  <SelectItem key={instructor.id} value={instructor.id}>
                    {instructor.first_name} {instructor.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Alert>
            <UserPlus className="h-4 w-4" />
            <AlertDescription>
              Mit einem Hilfslehrer kann die Gruppe auch bei Überbuchung gemeinsam betreut werden.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={assignMutation.isPending}>
            {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
