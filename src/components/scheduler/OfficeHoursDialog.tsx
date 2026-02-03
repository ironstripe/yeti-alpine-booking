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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building, Calendar, Clock } from "lucide-react";
import { useCreateOfficeHourBlock } from "@/hooks/useOfficeHourBlocks";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface OfficeHoursDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

export function OfficeHoursDialog({
  open,
  onOpenChange,
  onSuccess,
}: OfficeHoursDialogProps) {
  const [isFullDay, setIsFullDay] = useState(true);
  const [timeStart, setTimeStart] = useState("09:00");
  const [timeEnd, setTimeEnd] = useState("16:00");
  const [note, setNote] = useState("");

  const { state, clearSelection } = useSchedulerSelection();
  const createOfficeHourBlock = useCreateOfficeHourBlock();

  // Get date info from selections
  const dates = state.selections.map((s) => s.date).sort();
  const uniqueDates = [...new Set(dates)];
  const startDate = uniqueDates[0];
  const endDate = uniqueDates[uniqueDates.length - 1];

  // Use selection times if not full day
  const selectionStartTime = state.selections[0]?.startTime || "09:00";
  const selectionEndTime = state.selections[state.selections.length - 1]?.endTime || "16:00";

  const handleConfirm = async () => {
    if (!state.teacherId || uniqueDates.length === 0) return;

    const effectiveStartTime = isFullDay ? "09:00" : timeStart;
    const effectiveEndTime = isFullDay ? "16:00" : timeEnd;

    // Validate time range
    if (!isFullDay && effectiveStartTime >= effectiveEndTime) return;

    // Create an office hour block for each unique date
    for (const date of uniqueDates) {
      await createOfficeHourBlock.mutateAsync({
        instructorId: state.teacherId,
        date,
        timeStart: effectiveStartTime,
        timeEnd: effectiveEndTime,
        note: note || undefined,
      });
    }

    clearSelection();
    onSuccess();
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setIsFullDay(true);
    setTimeStart("09:00");
    setTimeEnd("16:00");
    setNote("");
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  // Initialize time from selection when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && state.selections.length > 0) {
      setTimeStart(selectionStartTime);
      setTimeEnd(selectionEndTime);
      // If selection is not full day (09:00-16:00), default to partial day
      if (selectionStartTime !== "09:00" || selectionEndTime !== "16:00") {
        setIsFullDay(false);
      }
    }
    if (!isOpen) {
      handleClose();
    } else {
      onOpenChange(isOpen);
    }
  };

  const formatDateDisplay = () => {
    if (uniqueDates.length === 1) {
      return format(parseISO(startDate), "EEEE, d. MMMM yyyy", { locale: de });
    }
    return `${uniqueDates.length} Tage ausgewählt`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-purple-600" />
            Bürodienst eintragen
          </DialogTitle>
          <DialogDescription>
            Bürodienst für den ausgewählten Zeitraum eintragen. Dieser wird im Stundenplan als besetzt angezeigt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Display */}
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{formatDateDisplay()}</span>
          </div>

          {/* Full Day Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Ganztägig</Label>
                <p className="text-sm text-muted-foreground">
                  09:00 - 16:00 Uhr
                </p>
              </div>
              <Switch
                checked={isFullDay}
                onCheckedChange={setIsFullDay}
              />
            </div>

            {/* Time Selection - Only show when not full day */}
            {!isFullDay && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Zeitraum
                </Label>
                <div className="flex items-center gap-2">
                  <Select value={timeStart} onValueChange={setTimeStart}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.slice(0, -1).map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">bis</span>
                  <Select value={timeEnd} onValueChange={setTimeEnd}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.slice(1).map((time) => (
                        <SelectItem
                          key={time}
                          value={time}
                          disabled={time <= timeStart}
                        >
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {timeStart >= timeEnd && (
                  <p className="text-xs text-destructive">
                    Endzeit muss nach Startzeit liegen
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Notiz (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z.B. Telefonbereitschaft, Abrechnungen..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              createOfficeHourBlock.isPending ||
              (!isFullDay && timeStart >= timeEnd)
            }
            className="bg-purple-600 hover:bg-purple-700"
          >
            {createOfficeHourBlock.isPending ? "Wird gespeichert..." : "Eintragen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
