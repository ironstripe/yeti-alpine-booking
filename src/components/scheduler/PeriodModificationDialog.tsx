import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Calendar, Clock, Users, Mail, Link2 } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { SchedulerBooking, SchedulerInstructor } from "@/lib/scheduler-utils";

export type PeriodModificationScope = "single_day" | "entire_period";

export interface PeriodModificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: SchedulerBooking;
  newSlot: {
    date: string;
    timeStart: string;
    timeEnd: string;
    instructorId: string;
  };
  instructors: SchedulerInstructor[];
  onConfirm: (scope: PeriodModificationScope, notifyCustomer: boolean) => void;
  isLoading?: boolean;
}

export function PeriodModificationDialog({
  open,
  onOpenChange,
  booking,
  newSlot,
  instructors,
  onConfirm,
  isLoading = false,
}: PeriodModificationDialogProps) {
  const [scope, setScope] = useState<PeriodModificationScope>("single_day");
  const [notifyCustomer, setNotifyCustomer] = useState(true);

  // Detect what changed
  const hasTimeChange = booking.timeStart !== newSlot.timeStart || booking.timeEnd !== newSlot.timeEnd;
  const hasDateChange = booking.date !== newSlot.date;
  const hasInstructorChange = booking.instructorId !== newSlot.instructorId;

  // Get instructor names
  const oldInstructor = instructors.find(i => i.id === booking.instructorId);
  const newInstructor = instructors.find(i => i.id === newSlot.instructorId);

  const oldInstructorName = oldInstructor 
    ? `${oldInstructor.first_name} ${oldInstructor.last_name}` 
    : "Nicht zugewiesen";
  const newInstructorName = newInstructor 
    ? `${newInstructor.first_name} ${newInstructor.last_name}` 
    : "Nicht zugewiesen";

  // Format dates
  const formattedOccurrenceDate = format(new Date(booking.date), "EEEE, d. MMMM", { locale: de });
  const formattedNewDate = format(new Date(newSlot.date), "EEEE, d. MMMM", { locale: de });
  const formattedPeriodStart = booking.periodStartDate 
    ? format(new Date(booking.periodStartDate), "d. MMM", { locale: de }) 
    : "";
  const formattedPeriodEnd = booking.periodEndDate 
    ? format(new Date(booking.periodEndDate), "d. MMM yyyy", { locale: de }) 
    : "";

  const handleConfirm = () => {
    onConfirm(scope, notifyCustomer);
  };

  const handleCancel = () => {
    onOpenChange(false);
    setScope("single_day"); // Reset for next time
    setNotifyCustomer(true);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-500" />
            Periodenbuchung verschieben
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Period Info Banner */}
              <div className="flex items-center gap-2 rounded-md bg-primary/10 p-3 border border-primary/20">
                <Calendar className="h-4 w-4 text-primary" />
                <div className="text-sm">
                  <span className="font-medium text-foreground">Zusammenhängende Buchung:</span>{" "}
                  <span className="text-muted-foreground">
                    {formattedPeriodStart} – {formattedPeriodEnd} ({booking.periodTotalDays} Tage)
                  </span>
                </div>
              </div>

              {/* Change Summary */}
              <div className="space-y-3 rounded-md bg-muted p-3">
                <p className="text-sm font-medium text-foreground">
                  Änderung am {formattedOccurrenceDate}:
                </p>

                {(hasTimeChange || hasDateChange) && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Clock className="h-4 w-4" />
                      {hasDateChange ? "Datum & Zeit" : "Zeit"}
                    </div>
                    <div className="ml-6 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-destructive">❌</span>
                        <span>
                          {hasDateChange && `${formattedOccurrenceDate}, `}
                          {booking.timeStart.slice(0, 5)} - {booking.timeEnd.slice(0, 5)} Uhr
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✅</span>
                        <span className="font-medium text-foreground">
                          {hasDateChange && `${formattedNewDate}, `}
                          {newSlot.timeStart.slice(0, 5)} - {newSlot.timeEnd.slice(0, 5)} Uhr
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {hasInstructorChange && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Users className="h-4 w-4" />
                      Lehrer geändert
                    </div>
                    <div className="ml-6 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-destructive">❌</span>
                        <span>{oldInstructorName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✅</span>
                        <span className="font-medium text-foreground">{newInstructorName}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scope Selection */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Was soll geändert werden?</p>
                <RadioGroup
                  value={scope}
                  onValueChange={(v) => setScope(v as PeriodModificationScope)}
                  className="space-y-2"
                >
                  <div className="flex items-start space-x-3 rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                    <RadioGroupItem value="single_day" id="single_day" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="single_day" className="font-medium cursor-pointer">
                        Nur dieser Tag ({formattedOccurrenceDate})
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Erstellt eine Ausnahme für diesen einzelnen Tag. Die anderen Tage bleiben unverändert.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
                    <RadioGroupItem value="entire_period" id="entire_period" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="entire_period" className="font-medium cursor-pointer">
                        Gesamte Periode ({formattedPeriodStart} – {formattedPeriodEnd})
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ändert alle {booking.periodTotalDays} Tage der Buchung gleichzeitig.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Affected Parties Info */}
              {hasInstructorChange && (
                <div className="rounded-md bg-destructive/10 p-3 border border-destructive/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-foreground">Betroffene Lehrer:</p>
                      <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <li>• {oldInstructorName} – wird abgemeldet (Bestätigung wird zurückgesetzt)</li>
                        <li>• {newInstructorName} – wird zugewiesen (muss neu bestätigen)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Notification Checkbox */}
        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="notify-customer-period"
            checked={notifyCustomer}
            onCheckedChange={(checked) => setNotifyCustomer(checked === true)}
          />
          <Label
            htmlFor="notify-customer-period"
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Mail className="h-4 w-4" />
            Kunde per E-Mail informieren
          </Label>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Speichern..." : "Änderungen speichern"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
