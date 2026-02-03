import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteAbsence } from "@/hooks/useInstructorAbsences";
import { type SchedulerAbsence } from "@/lib/scheduler-utils";
import { 
  Ban, 
  Calendar, 
  Clock, 
  FileText, 
  Pencil, 
  Trash2,
  Palmtree,
  Thermometer,
  Building2,
  Briefcase
} from "lucide-react";

interface AbsenceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  absence: SchedulerAbsence;
}

const ABSENCE_LABELS: Record<string, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  organization: "Organisation",
  office_duty: "Bürodienst",
  other: "Abwesend",
};

const ABSENCE_ICONS: Record<string, typeof Ban> = {
  vacation: Palmtree,
  sick: Thermometer,
  organization: Building2,
  office_duty: Briefcase,
  other: Ban,
};

export function AbsenceDetailDialog({ 
  open, 
  onOpenChange, 
  absence 
}: AbsenceDetailDialogProps) {
  const navigate = useNavigate();
  const deleteAbsence = useDeleteAbsence();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isPending = absence.status === "pending";
  const isPartialDay = !absence.isFullDay && absence.timeStart && absence.timeEnd;
  const Icon = ABSENCE_ICONS[absence.type] || Ban;

  const handleEdit = () => {
    onOpenChange(false);
    // Navigate with absenceId to auto-open edit dialog for this specific absence
    navigate(`/instructors/${absence.instructorId}?absences=open&absenceId=${absence.id}`);
  };

  const handleDelete = async () => {
    await deleteAbsence.mutateAsync(absence.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className="h-5 w-5" />
              {ABSENCE_LABELS[absence.type]}
              {isPending && (
                <Badge variant="outline" className="ml-2 border-amber-500 text-amber-600">
                  Ausstehend
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            {/* Date Range */}
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Zeitraum</p>
                <p className="text-sm text-muted-foreground">
                  {absence.startDate === absence.endDate
                    ? absence.startDate
                    : `${absence.startDate} - ${absence.endDate}`}
                </p>
              </div>
            </div>

            {/* Time Range (if partial day) */}
            {isPartialDay && (
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Uhrzeit</p>
                  <p className="text-sm text-muted-foreground">
                    {absence.timeStart} - {absence.timeEnd}
                  </p>
                </div>
              </div>
            )}

            {/* Reason */}
            {absence.reason && (
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Grund</p>
                  <p className="text-sm text-muted-foreground">{absence.reason}</p>
                </div>
              </div>
            )}

            {/* Status Info */}
            <div className="rounded-md bg-muted p-3 text-sm">
              {isPending ? (
                <p className="text-amber-600">
                  Dieser Antrag wartet noch auf Genehmigung.
                </p>
              ) : isPartialDay ? (
                <p className="text-muted-foreground">
                  Blockiert: {absence.timeStart} - {absence.timeEnd}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Keine Buchungen möglich (ganztägig)
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 sm:justify-between">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Löschen
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleEdit}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Bearbeiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showDeleteConfirm && (
        <ConfirmDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Abwesenheit löschen"
          description={`Möchtest du diese ${ABSENCE_LABELS[absence.type]}-Abwesenheit wirklich löschen?`}
          confirmLabel="Löschen"
          variant="destructive"
          onConfirm={handleDelete}
          isLoading={deleteAbsence.isPending}
        />
      )}
    </>
  );
}
