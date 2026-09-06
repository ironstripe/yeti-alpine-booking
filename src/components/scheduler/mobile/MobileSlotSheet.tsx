import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { timeToMinutes, type SchedulerBooking, type SchedulerAbsence } from "@/lib/scheduler-utils";
import { minutesToTime } from "@/lib/scheduler-agenda";
import type { MobileSlotTapPayload } from "./MobileSlotContext";

const MIN_DURATION = 60;
const MAX_DURATION = 240;
const START_STEP = 15;
const DURATION_STEP = 30;

interface MobileSlotSheetProps {
  slot: MobileSlotTapPayload | null;
  instructorName: string;
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  onOpenChange: (open: boolean) => void;
}

export function MobileSlotSheet({
  slot,
  instructorName,
  bookings,
  absences,
  onOpenChange,
}: MobileSlotSheetProps) {
  const navigate = useNavigate();
  const { canSelectSlot } = useSchedulerSelection();

  const intervalStart = slot ? timeToMinutes(slot.startTime) : 0;
  const intervalEnd = slot ? timeToMinutes(slot.endTime) : 0;

  const startOptions = useMemo(() => {
    if (!slot) return [];
    const options: string[] = [];
    for (let m = intervalStart; m + MIN_DURATION <= intervalEnd; m += START_STEP) {
      options.push(minutesToTime(m));
    }
    return options;
  }, [slot, intervalStart, intervalEnd]);

  const [startTime, setStartTime] = useState<string>(slot?.startTime ?? "");
  const [duration, setDuration] = useState<number>(MIN_DURATION);

  useEffect(() => {
    if (!slot) return;
    setStartTime(slot.startTime);
    setDuration(Math.min(MIN_DURATION, intervalEnd - intervalStart));
  }, [slot, intervalStart, intervalEnd]);

  const durationOptions = useMemo(() => {
    if (!startTime) return [];
    const available = intervalEnd - timeToMinutes(startTime);
    const options: number[] = [];
    for (let d = MIN_DURATION; d <= Math.min(MAX_DURATION, available); d += DURATION_STEP) {
      options.push(d);
    }
    return options;
  }, [startTime, intervalEnd]);

  useEffect(() => {
    if (durationOptions.length === 0) return;
    if (!durationOptions.includes(duration)) {
      setDuration(durationOptions[0]);
    }
  }, [durationOptions, duration]);

  if (!slot) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" />
      </Sheet>
    );
  }

  const endTime = startTime ? minutesToTime(timeToMinutes(startTime) + duration) : "";

  const handleCreate = () => {
    const validation = canSelectSlot(
      slot.instructorId,
      slot.date,
      startTime,
      endTime,
      bookings,
      absences
    );
    if (!validation.valid) {
      toast.error(validation.reason || "Zeitraum nicht verfügbar");
      return;
    }

    const params = new URLSearchParams({
      instructor: slot.instructorId,
      appointments: JSON.stringify([
        {
          instructorId: slot.instructorId,
          date: slot.date,
          startTime,
          durationMinutes: duration,
        },
      ]),
    });
    onOpenChange(false);
    navigate(`/bookings/new?${params.toString()}`);
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <SheetHeader className="text-left">
          <SheetTitle>Neue Buchung</SheetTitle>
          <SheetDescription>
            {instructorName} · {format(parseISO(slot.date), "EEE, d. MMM", { locale: de })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Start</p>
            <div className="flex flex-wrap gap-2">
              {startOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStartTime(option)}
                  className={cn(
                    "min-h-11 min-w-[64px] rounded-md border px-3 text-sm",
                    option === startTime
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Dauer</p>
            <div className="flex flex-wrap gap-2">
              {durationOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDuration(option)}
                  className={cn(
                    "min-h-11 min-w-[64px] rounded-md border px-3 text-sm",
                    option === duration
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  )}
                >
                  {option % 60 === 0 ? `${option / 60} h` : `${(option / 60).toFixed(1)} h`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Ende</span>
            <span className="font-medium">{endTime}</span>
          </div>

          <Button
            className="sticky bottom-0 min-h-12 w-full shadow-lg"
            onClick={handleCreate}
            disabled={!startTime || durationOptions.length === 0}
          >
            Buchung erstellen
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
