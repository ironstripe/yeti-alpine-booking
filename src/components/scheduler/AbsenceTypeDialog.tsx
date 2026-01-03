import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Ban, Calendar, Clock, Info } from "lucide-react";
import { useCreateAbsence } from "@/hooks/useInstructorAbsences";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { useUserRole } from "@/hooks/useUserRole";
import type { SchedulerBooking } from "@/lib/scheduler-utils";
import { cn } from "@/lib/utils";

export const ABSENCE_TYPES = {
  vacation: { label: "Urlaub", description: "Geplanter Urlaub" },
  sick: { label: "Krank", description: "Krankheitsbedingte Abwesenheit" },
  organization: { label: "Organisation", description: "Organisatorische Aufgaben" },
  office_duty: { label: "Bürodienst", description: "Büroarbeit / Verwaltung" },
  other: { label: "Sonstiges", description: "Andere Abwesenheitsgründe" },
} as const;

export type AbsenceType = keyof typeof ABSENCE_TYPES;

interface AbsenceTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: SchedulerBooking[];
  onSuccess: () => void;
}

export function AbsenceTypeDialog({
  open,
  onOpenChange,
  conflicts,
  onSuccess,
}: AbsenceTypeDialogProps) {
  const [selectedType, setSelectedType] = useState<AbsenceType>("vacation");
  const [reason, setReason] = useState("");
  const [submitForApproval, setSubmitForApproval] = useState(false);
  
  const { state, clearSelection } = useSchedulerSelection();
  const { isAdminOrOffice, instructorId } = useUserRole();
  const createAbsence = useCreateAbsence();

  const hasConflicts = conflicts.length > 0;
  
  // Determine if the absence should be pending or confirmed
  // Admin/Office can create confirmed absences unless they toggle "submit for approval"
  // Teachers always create pending absences
  const willBePending = !isAdminOrOffice || submitForApproval;
  
  // Teachers can only create absences for themselves
  const isCreatingForSelf = instructorId && state.teacherId === instructorId;
  const canCreateAbsence = isAdminOrOffice || isCreatingForSelf;

  const handleConfirm = async () => {
    if (hasConflicts || !state.teacherId || state.selections.length === 0) return;

    // Get date range from selections
    const dates = state.selections.map((s) => s.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    await createAbsence.mutateAsync({
      instructorId: state.teacherId,
      startDate,
      endDate,
      type: selectedType,
      reason: reason || undefined,
      status: willBePending ? "pending" : "confirmed",
    });

    clearSelection();
    onSuccess();
    onOpenChange(false);
    
    // Reset form
    setSelectedType("vacation");
    setReason("");
    setSubmitForApproval(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedType("vacation");
    setReason("");
    setSubmitForApproval(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {willBePending ? (
              <Clock className="h-5 w-5 text-amber-500" />
            ) : (
              <Ban className="h-5 w-5" />
            )}
            {willBePending ? "Abwesenheit beantragen" : "Abwesenheit eintragen"}
          </DialogTitle>
          <DialogDescription>
            {willBePending 
              ? "Dein Antrag wird zur Genehmigung an das Büro gesendet."
              : "Wähle den Grund der Abwesenheit für den ausgewählten Zeitraum."
            }
          </DialogDescription>
        </DialogHeader>

        {/* Teacher Not Creating For Self Warning */}
        {!canCreateAbsence && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Keine Berechtigung</AlertTitle>
            <AlertDescription>
              Du kannst nur Abwesenheiten für dich selbst beantragen.
            </AlertDescription>
          </Alert>
        )}

        {/* Conflict Warning */}
        {hasConflicts && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Konflikt mit bestehenden Buchungen</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-2">
                Es gibt {conflicts.length} Buchung(en) im ausgewählten Zeitraum. 
                Diese müssen zuerst verschoben werden:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {conflicts.slice(0, 3).map((booking) => (
                  <li key={booking.id}>
                    {booking.date}: {booking.timeStart} - {booking.timeEnd}
                    {booking.participantName && ` (${booking.participantName})`}
                  </li>
                ))}
                {conflicts.length > 3 && (
                  <li>...und {conflicts.length - 3} weitere</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Pending Info Banner */}
        {willBePending && canCreateAbsence && !hasConflicts && (
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <Clock className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600">Antrag erforderlich</AlertTitle>
            <AlertDescription className="text-amber-600/80">
              Deine Abwesenheit wird als Antrag eingereicht und muss vom Büro genehmigt werden.
            </AlertDescription>
          </Alert>
        )}

        {/* Selection Summary */}
        <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {state.selections.length} Zeitfenster ausgewählt
          </span>
        </div>

        {/* Absence Type Selection */}
        <div className="space-y-3">
          <Label>Art der Abwesenheit</Label>
          <RadioGroup
            value={selectedType}
            onValueChange={(value) => setSelectedType(value as AbsenceType)}
            className="space-y-2"
          >
            {Object.entries(ABSENCE_TYPES).map(([key, { label, description }]) => (
              <label
                key={key}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-md border cursor-pointer",
                  "hover:bg-muted/50 transition-colors",
                  selectedType === key && "border-primary bg-primary/5"
                )}
              >
                <RadioGroupItem value={key} className="mt-0.5" />
                <div>
                  <span className="font-medium">{label}</span>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Optional Reason */}
        <div className="space-y-2">
          <Label htmlFor="reason">Bemerkung (optional)</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="z.B. Arzttermin, Fortbildung..."
            rows={2}
          />
        </div>

        {/* Submit for Approval Toggle - Only for Admin/Office */}
        {isAdminOrOffice && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Als Antrag senden</Label>
                <p className="text-sm text-muted-foreground">
                  Erfordert Genehmigung im Dashboard
                </p>
              </div>
              <Switch
                checked={submitForApproval}
                onCheckedChange={setSubmitForApproval}
              />
            </div>
            {submitForApproval && (
              <Alert className="border-amber-500/30 bg-amber-500/10">
                <Info className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-amber-600/80">
                  Die Abwesenheit wird als Antrag eingereicht und erscheint im Dashboard zur Genehmigung.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={hasConflicts || !canCreateAbsence || createAbsence.isPending}
          >
            {createAbsence.isPending 
              ? "Speichern..." 
              : willBePending 
                ? "Antrag senden" 
                : "Abwesenheit eintragen"
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
