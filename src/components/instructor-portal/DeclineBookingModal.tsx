import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useConfirmBooking } from '@/hooks/useConfirmBooking';
import { Loader2, AlertCircle } from 'lucide-react';

interface DeclineBookingModalProps {
  ticketItemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeclineBookingModal({
  ticketItemId,
  open,
  onOpenChange,
}: DeclineBookingModalProps) {
  const [reason, setReason] = useState('');
  const { mutate, isPending } = useConfirmBooking();

  // Reset reason when modal opens/closes
  useEffect(() => {
    if (!open) {
      setReason('');
    }
  }, [open]);

  const handleDecline = () => {
    if (!reason.trim() || !ticketItemId) {
      return;
    }

    mutate(
      { ticketItemId, action: 'decline', reason: reason.trim() },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  const handleClose = () => {
    if (!isPending) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Buchung ablehnen
          </DialogTitle>
          <DialogDescription>
            Bitte gib einen Grund für die Ablehnung an. Das Büro wird
            benachrichtigt und kann die Buchung neu zuweisen.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Textarea
            placeholder="Grund für die Ablehnung..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            disabled={isPending}
            className="resize-none"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isPending}
            className="min-h-[44px]"
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleDecline}
            disabled={isPending || !reason.trim()}
            className="min-h-[44px]"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ablehnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
