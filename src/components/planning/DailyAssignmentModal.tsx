import { useState } from 'react';
import { format, parseISO, getISOWeek, endOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAssignInstructor } from '@/hooks/useGroupCourses';
import { InstanceChangeConfirmDialog } from '@/components/trainings/InstanceChangeConfirmDialog';
import type { GroupPlanningCourse } from '@/hooks/useGroupPlanningData';
import type { Instructor } from '@/hooks/useInstructors';
import { useQueryClient } from '@tanstack/react-query';

interface DailyAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: GroupPlanningCourse | null;
  weekStart: Date;
  instructors: Instructor[];
}

export function DailyAssignmentModal({
  open,
  onOpenChange,
  course,
  weekStart,
  instructors,
}: DailyAssignmentModalProps) {
  const assignInstructor = useAssignInstructor();
  const queryClient = useQueryClient();
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekNumber = getISOWeek(weekStart);

  // Pending change state for confirmation dialog
  const [pendingChange, setPendingChange] = useState<{
    instanceId: string;
    instructorId: string | null;
    isAssistant: boolean;
    oldInstructorName: string | null;
    newInstructorName: string | null;
    participantCount: number;
  } | null>(null);

  if (!course) return null;

  const handleInstanceAssign = async (
    instanceId: string,
    value: string,
    isAssistant: boolean,
    currentParticipants: number,
    currentInstructorId: string | null
  ) => {
    const newInstructorId = value === 'none' ? null : value;
    
    // If participants exist and instructor is changing (not assistant), show confirmation
    if (!isAssistant && currentParticipants > 0 && currentInstructorId !== newInstructorId) {
      const oldInstructor = instructors.find(i => i.id === currentInstructorId);
      const newInstructor = instructors.find(i => i.id === newInstructorId);
      
      setPendingChange({
        instanceId,
        instructorId: newInstructorId,
        isAssistant,
        oldInstructorName: oldInstructor ? `${oldInstructor.first_name} ${oldInstructor.last_name}` : null,
        newInstructorName: newInstructor ? `${newInstructor.first_name} ${newInstructor.last_name}` : null,
        participantCount: currentParticipants,
      });
      return;
    }
    
    // No participants or assistant change, proceed directly
    await performAssignment(instanceId, newInstructorId, isAssistant);
  };

  const performAssignment = async (instanceId: string, instructorId: string | null, isAssistant: boolean) => {
    await assignInstructor.mutateAsync({
      instanceId,
      instructorId,
      isAssistant,
    });
    
    // Invalidate the planning data to refresh
    queryClient.invalidateQueries({ 
      queryKey: ['group-planning', format(weekStart, 'yyyy-MM-dd')] 
    });
  };

  const handleConfirmChange = async (notifyParticipants: boolean) => {
    if (!pendingChange) return;
    
    // TODO: Integrate with notification system when notifyParticipants is true
    await performAssignment(pendingChange.instanceId, pendingChange.instructorId, pendingChange.isAssistant);
    setPendingChange(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: course.color }}
            />
            {course.name} - Tagesdetails
          </DialogTitle>
          <DialogDescription>
            KW {weekNumber}: {format(weekStart, 'd.', { locale: de })} -{' '}
            {format(weekEnd, 'd. MMMM yyyy', { locale: de })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
          {course.instances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Keine Instanzen für diese Woche vorhanden.
            </div>
          ) : (
            course.instances.map(instance => {
              const date = parseISO(instance.date);
              const isOverride = instance.instructorId !== course.weeklyInstructorId && 
                course.weeklyInstructorId !== null;

              return (
                <div
                  key={instance.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg bg-muted/30"
                >
                  {/* Date and time */}
                  <div className="w-full sm:w-32 flex sm:flex-col items-center sm:items-start gap-2 sm:gap-0">
                    <div className="font-medium">
                      {format(date, 'EEE, d.M.', { locale: de })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {instance.startTime?.slice(0, 5)} - {instance.endTime?.slice(0, 5)}
                    </div>
                    {isOverride && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        Abweichend
                      </Badge>
                    )}
                  </div>

                  {/* Instructor selects */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select
                      value={instance.instructorId || 'none'}
                      onValueChange={(v) => handleInstanceAssign(
                        instance.id, 
                        v === 'none' ? '' : v, 
                        false,
                        instance.currentParticipants,
                        instance.instructorId
                      )}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Lehrer wählen..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="none">Nicht zugewiesen</SelectItem>
                        {instructors.map(i => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.first_name} {i.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={instance.assistantId || 'none'}
                      onValueChange={(v) => handleInstanceAssign(
                        instance.id, 
                        v === 'none' ? '' : v, 
                        true,
                        instance.currentParticipants,
                        instance.assistantId
                      )}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Hilfskraft..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="none">Keine</SelectItem>
                        {instructors
                          .filter(i => i.id !== instance.instructorId)
                          .map(i => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.first_name} {i.last_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Participant count */}
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground sm:w-16 justify-end">
                    <Users className="h-3.5 w-3.5" />
                    <span>{instance.currentParticipants} TN</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schliessen
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Confirmation Dialog for instructor changes */}
      <InstanceChangeConfirmDialog
        open={!!pendingChange}
        onOpenChange={(open) => {
          if (!open) setPendingChange(null);
        }}
        onConfirm={handleConfirmChange}
        title="Lehrer ändern"
        description="Möchten Sie den Lehrer für diese Instanz ändern?"
        participantCount={pendingChange?.participantCount || 0}
        changes={pendingChange ? [
          {
            label: 'Lehrer',
            oldValue: pendingChange.oldInstructorName || 'Nicht zugewiesen',
            newValue: pendingChange.newInstructorName || 'Nicht zugewiesen',
          }
        ] : undefined}
        confirmText="Ändern"
      />
    </Dialog>
  );
}
