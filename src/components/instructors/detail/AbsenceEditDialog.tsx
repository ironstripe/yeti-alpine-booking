import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import { useUpdateAbsence, type AbsenceType } from "@/hooks/useInstructorAbsences";
import { type AbsenceHistoryItem } from "@/hooks/useInstructorAbsenceHistory";

interface AbsenceEditDialogProps {
  absence: AbsenceHistoryItem | null;
  onClose: () => void;
}

const ABSENCE_TYPES: { value: AbsenceType; label: string }[] = [
  { value: "vacation", label: "Urlaub" },
  { value: "sick", label: "Krank" },
  { value: "organization", label: "Organisation" },
  { value: "office_duty", label: "Bürodienst" },
  { value: "other", label: "Sonstiges" },
];

const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"
];

export function AbsenceEditDialog({ absence, onClose }: AbsenceEditDialogProps) {
  const [absenceType, setAbsenceType] = useState<AbsenceType>("vacation");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [isFullDay, setIsFullDay] = useState(true);
  const [timeStart, setTimeStart] = useState("12:00");
  const [timeEnd, setTimeEnd] = useState("14:00");
  const [reason, setReason] = useState("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const updateAbsence = useUpdateAbsence();

  // Initialize form when absence changes
  useEffect(() => {
    if (absence) {
      setAbsenceType(absence.type as AbsenceType);
      setDateRange({
        from: new Date(absence.startDate),
        to: new Date(absence.endDate),
      });
      setIsFullDay(absence.isFullDay);
      setTimeStart(absence.timeStart || "12:00");
      setTimeEnd(absence.timeEnd || "14:00");
      setReason(absence.reason || "");
    }
  }, [absence]);

  const handleSubmit = async () => {
    if (!absence || !dateRange.from) return;

    if (!isFullDay && timeStart >= timeEnd) {
      return;
    }

    const startDate = format(dateRange.from, "yyyy-MM-dd");
    const endDate = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : startDate;

    await updateAbsence.mutateAsync({
      absenceId: absence.id,
      startDate,
      endDate,
      type: absenceType,
      reason: reason.trim() || undefined,
      isFullDay,
      timeStart: isFullDay ? undefined : timeStart,
      timeEnd: isFullDay ? undefined : timeEnd,
    });

    onClose();
  };

  return (
    <Dialog open={!!absence} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abwesenheit bearbeiten</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Absence Type */}
          <div className="space-y-2">
            <Label>Art der Abwesenheit</Label>
            <Select value={absenceType} onValueChange={(v) => setAbsenceType(v as AbsenceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label>Zeitraum</Label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd.MM.yyyy")} - {format(dateRange.to, "dd.MM.yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "dd.MM.yyyy")
                    )
                  ) : (
                    "Datum wählen"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="start" side="top">
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => {
                    setDateRange({ from: range?.from, to: range?.to });
                    if (range?.from && range?.to) {
                      setIsCalendarOpen(false);
                    }
                  }}
                  numberOfMonths={1}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Full Day Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="edit-full-day">Ganztägig</Label>
            <Switch
              id="edit-full-day"
              checked={isFullDay}
              onCheckedChange={setIsFullDay}
            />
          </div>

          {/* Time Selection */}
          {!isFullDay && (
            <div className="space-y-2">
              <Label>Zeitraum</Label>
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

          {/* Reason */}
          <div className="space-y-2">
            <Label>Grund (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z.B. Familienfeier, Arzttermin..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!dateRange.from || updateAbsence.isPending}
          >
            {updateAbsence.isPending ? "Wird gespeichert..." : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
