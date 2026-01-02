import { Check, Mail, MessageCircle, Eye, Plus, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BookingSuccessModalProps {
  open: boolean;
  ticketNumber: string;
  ticketId: string;
  customerEmail: string | null;
  instructorName: string | null;
  onClose: () => void;
  onNewBooking: () => void;
}

export function BookingSuccessModal({
  open,
  ticketNumber,
  ticketId,
  customerEmail,
  instructorName,
  onClose,
  onNewBooking,
}: BookingSuccessModalProps) {
  const navigate = useNavigate();

  const handleViewBooking = () => {
    onClose();
    navigate(`/bookings/${ticketId}`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="text-center sm:max-w-md">
        <DialogHeader className="items-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <DialogTitle className="text-xl">Buchung erfolgreich erstellt!</DialogTitle>
          <DialogDescription className="text-lg font-medium">
            Ticketnummer: {ticketNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-4 text-sm text-muted-foreground">
          {customerEmail && (
            <p className="flex items-center justify-center gap-2">
              <Mail className="h-4 w-4" />
              Bestätigung wird an {customerEmail} gesendet
            </p>
          )}
          {instructorName && (
            <p className="flex items-center justify-center gap-2">
              <MessageCircle className="h-4 w-4" />
              {instructorName} wird per WhatsApp informiert
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={handleViewBooking} className="w-full">
            <Eye className="mr-2 h-4 w-4" />
            Buchung anzeigen
          </Button>
          <Button variant="outline" onClick={onNewBooking} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Neue Buchung
          </Button>
          <Button variant="ghost" onClick={handlePrint} className="w-full">
            <Printer className="mr-2 h-4 w-4" />
            Ticket drucken
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}