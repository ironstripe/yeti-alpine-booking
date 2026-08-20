import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  useCreateRecurringBlock,
  useUpdateRecurringBlock,
  useRecurringBlockConflicts,
  type RecurringBlock,
} from "@/hooks/useRecurringBlocks";

const WEEKDAYS = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 0, label: "So" },
];

const PRESETS: Record<string, { startTime: string; endTime: string; weekdays: number[]; reason: string }> = {
  lunch: { startTime: "12:00", endTime: "13:00", weekdays: [1, 2, 3, 4, 5], reason: "Mittagspause" },
  morning_only: { startTime: "13:00", endTime: "16:00", weekdays: [1, 2, 3, 4, 5], reason: "Nur Vormittage verfügbar" },
  afternoon_only: { startTime: "09:00", endTime: "12:00", weekdays: [1, 2, 3, 4, 5], reason: "Nur Nachmittage verfügbar" },
  group_reserve: { startTime: "10:00", endTime: "12:00", weekdays: [1, 2, 3, 4, 5], reason: "Gruppenkurs Reserve" },
};

interface RecurringBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructorId: string;
  editingBlock?: RecurringBlock | null;
  presetType?: string | null;
}

export function RecurringBlockDialog({
  open,
  onOpenChange,
  instructorId,
  editingBlock,
  presetType,
}: RecurringBlockDialogProps) {
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split("T")[0]);
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");

  const createMutation = useCreateRecurringBlock();
  const updateMutation = useUpdateRecurringBlock();

  const { data: conflicts = [], isLoading: isCheckingConflicts } = useRecurringBlockConflicts(
    instructorId,
    startTime,
    endTime,
    weekdays,
    validFrom,
    validUntil || null
  );

  // Apply preset or editing values when dialog opens
  useEffect(() => {
    if (!open) return;

    if (editingBlock) {
      setStartTime(editingBlock.start_time.slice(0, 5));
      setEndTime(editingBlock.end_time.slice(0, 5));
      setWeekdays(editingBlock.weekdays);
      setValidFrom(editingBlock.valid_from);
      setValidUntil(editingBlock.valid_until || "");
      setReason(editingBlock.reason || "");
    } else if (presetType && PRESETS[presetType]) {
      const preset = PRESETS[presetType];
      setStartTime(preset.startTime);
      setEndTime(preset.endTime);
      setWeekdays(preset.weekdays);
      setReason(preset.reason);
      setValidFrom(new Date().toISOString().split("T")[0]);
      setValidUntil("");
    } else {
      // Custom - reset to defaults
      setStartTime("12:00");
      setEndTime("13:00");
      setWeekdays([1, 2, 3, 4, 5]);
      setReason("");
      setValidFrom(new Date().toISOString().split("T")[0]);
      setValidUntil("");
    }
  }, [open, presetType, editingBlock]);

  const toggleWeekday = (day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const selectAllWeekdays = () => setWeekdays([0, 1, 2, 3, 4, 5, 6]);
  const selectWorkdays = () => setWeekdays([1, 2, 3, 4, 5]);
  const selectWeekend = () => setWeekdays([0, 6]);

  const handleSubmit = async () => {
    const blockData = {
      start_time: startTime,
      end_time: endTime,
      weekdays,
      valid_from: validFrom,
      valid_until: validUntil || null,
      reason: reason || null,
      preset_type: presetType || "custom",
    };

    if (editingBlock) {
      await updateMutation.mutateAsync({
        blockId: editingBlock.id,
        updates: blockData,
      });
    } else {
      await createMutation.mutateAsync({
        ...blockData,
        instructor_id: instructorId,
      });
    }

    onOpenChange(false);
  };

  const canSubmit = 
    conflicts.length === 0 && 
    weekdays.length > 0 && 
    startTime && 
    endTime && 
    validFrom &&
    startTime < endTime;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingBlock ? "Block bearbeiten" : "Wiederkehrenden Block erstellen"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Bezeichnung</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z.B. Mittagspause"
            />
          </div>

          {/* Time Window */}
          <div className="space-y-2">
            <Label>Zeitfenster *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-32"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-32"
              />
            </div>
            {startTime >= endTime && (
              <p className="text-sm text-destructive">Endzeit muss nach Startzeit liegen</p>
            )}
          </div>

          {/* Weekdays */}
          <div className="space-y-2">
            <Label>Wochentage *</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label
                  key={day.value}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <Checkbox
                    checked={weekdays.includes(day.value)}
                    onCheckedChange={() => toggleWeekday(day.value)}
                  />
                  <span className="text-sm">{day.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={selectAllWeekdays}
              >
                Alle
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={selectWorkdays}
              >
                Mo-Fr
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={selectWeekend}
              >
                Wochenende
              </Button>
            </div>
          </div>

          {/* Validity Period */}
          <div className="space-y-2">
            <Label>Gültigkeitszeitraum</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-40"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                placeholder="Saisonende"
                className="w-40"
                min={validFrom}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leer lassen für "bis Saisonende"
            </p>
          </div>

          {/* Conflict Warning */}
          {conflicts.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-1">
                  Konflikt mit {conflicts.length} bestehenden Buchung(en):
                </p>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {conflicts.slice(0, 5).map((c) => (
                    <li key={c.booking_id}>
                      {new Date(c.booking_date).toLocaleDateString("de-CH")}{" "}
                      {c.time_start.slice(0, 5)}-{c.time_end.slice(0, 5)}:{" "}
                      {c.participant_name}
                    </li>
                  ))}
                  {conflicts.length > 5 && (
                    <li className="text-muted-foreground">
                      ... und {conflicts.length - 5} weitere
                    </li>
                  )}
                </ul>
                <p className="mt-2 text-xs">
                  Bitte löse die Konflikte zuerst, bevor du den Block speichern kannst.
                </p>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
          >
            {isPending ? "Wird gespeichert..." : "Antrag einreichen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
