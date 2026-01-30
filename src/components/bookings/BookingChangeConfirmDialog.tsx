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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Calendar, Clock, Users, Mail } from "lucide-react";

export type ChangeType = 'date' | 'instructor' | 'both' | 'none';

export interface BookingChangeValues {
  date?: string;
  time?: string;
  instructor?: string;
}

interface BookingChangeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (notifyCustomer: boolean) => void;
  changeType: ChangeType;
  customerName?: string;
  customerEmail?: string;
  oldValues: BookingChangeValues;
  newValues: BookingChangeValues;
  isLoading?: boolean;
}

export function BookingChangeConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  changeType,
  customerName,
  customerEmail,
  oldValues,
  newValues,
  isLoading = false,
}: BookingChangeConfirmDialogProps) {
  const [notifyCustomer, setNotifyCustomer] = useState(true);

  const hasDateChange = changeType === 'date' || changeType === 'both';
  const hasInstructorChange = changeType === 'instructor' || changeType === 'both';
  const hasEmail = !!customerEmail;

  const handleConfirm = () => {
    onConfirm(notifyCustomer && hasEmail);
  };

  const handleCancel = () => {
    onOpenChange(false);
    setNotifyCustomer(true); // Reset for next time
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Buchung ändern
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                Folgende Änderungen werden gespeichert
                {customerName && ` für ${customerName}`}:
              </p>

              <div className="space-y-3 rounded-md bg-muted p-3">
                {hasDateChange && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Calendar className="h-4 w-4" />
                      Datum/Zeit geändert
                    </div>
                    <div className="ml-6 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-destructive">❌</span>
                        <span>{oldValues.date} {oldValues.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✅</span>
                        <span className="font-medium">{newValues.date} {newValues.time}</span>
                      </div>
                    </div>
                  </div>
                )}

                {hasInstructorChange && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4" />
                      Lehrer geändert
                    </div>
                    <div className="ml-6 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-destructive">❌</span>
                        <span>{oldValues.instructor || "Nicht zugewiesen"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-green-600">✅</span>
                        <span className="font-medium">{newValues.instructor || "Nicht zugewiesen"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="notify-customer"
            checked={notifyCustomer}
            onCheckedChange={(checked) => setNotifyCustomer(checked === true)}
            disabled={!hasEmail}
          />
          <Label 
            htmlFor="notify-customer" 
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Mail className="h-4 w-4" />
            Kunde per E-Mail informieren
          </Label>
          {!hasEmail && (
            <span className="text-xs text-muted-foreground">(Keine E-Mail hinterlegt)</span>
          )}
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

/**
 * Detects what type of change occurred between old and new booking values
 */
export function detectChangeType(
  originalDate: string | undefined,
  originalTime: string | undefined,
  originalInstructorId: string | null | undefined,
  newDate: string | undefined,
  newTime: string | undefined,
  newInstructorId: string | null | undefined
): ChangeType {
  const hasDateChange = originalDate !== newDate || originalTime !== newTime;
  const hasInstructorChange = originalInstructorId !== newInstructorId;

  if (hasDateChange && hasInstructorChange) return 'both';
  if (hasDateChange) return 'date';
  if (hasInstructorChange) return 'instructor';
  return 'none';
}
