import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Users, Mail } from "lucide-react";

interface InstanceChangeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (notifyParticipants: boolean, reason?: string) => void;
  title: string;
  description: string;
  participantCount: number;
  changes?: {
    label: string;
    oldValue?: string;
    newValue?: string;
  }[];
  isCancellation?: boolean;
  confirmText?: string;
  cancelText?: string;
}

export function InstanceChangeConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  participantCount,
  changes,
  isCancellation = false,
  confirmText = "Bestätigen",
  cancelText = "Abbrechen",
}: InstanceChangeConfirmDialogProps) {
  const [notifyParticipants, setNotifyParticipants] = useState(true);
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(notifyParticipants, isCancellation ? reason : undefined);
    setNotifyParticipants(true);
    setReason('');
  };

  const handleCancel = () => {
    onOpenChange(false);
    setNotifyParticipants(true);
    setReason('');
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Participant count warning */}
        {participantCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <Users className="h-4 w-4 text-warning" />
            <span className="text-sm">
              Diese Änderung betrifft <strong>{participantCount}</strong> Teilnehmer
            </span>
          </div>
        )}

        {/* Changes list */}
        {changes && changes.length > 0 && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <span className="text-xs font-medium text-muted-foreground">Änderungen:</span>
            {changes.map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="text-xs">{change.label}</Badge>
                {change.oldValue && (
                  <>
                    <span className="line-through text-muted-foreground">{change.oldValue}</span>
                    <span>→</span>
                  </>
                )}
                <span className="font-medium">{change.newValue}</span>
              </div>
            ))}
          </div>
        )}

        {/* Cancellation reason */}
        {isCancellation && (
          <div className="space-y-2">
            <Label htmlFor="cancellation-reason">Grund der Absage</Label>
            <Textarea
              id="cancellation-reason"
              placeholder="z.B. Schlechte Wetterbedingungen, Krankheit des Lehrers..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        )}

        {/* Notification toggle */}
        {participantCount > 0 && (
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <Checkbox
              id="notify-participants"
              checked={notifyParticipants}
              onCheckedChange={(checked) => setNotifyParticipants(checked === true)}
            />
            <Label 
              htmlFor="notify-participants" 
              className="flex items-center gap-2 cursor-pointer text-sm"
            >
              <Mail className="h-4 w-4" />
              Alle {participantCount} Teilnehmer per E-Mail informieren
            </Label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirm}
            className={isCancellation ? "bg-destructive hover:bg-destructive/90" : ""}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
