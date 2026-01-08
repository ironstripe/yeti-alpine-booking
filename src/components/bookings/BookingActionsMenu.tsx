import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Eye,
  CreditCard,
  Send,
  Printer,
  Copy,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TicketWithDetails } from "@/hooks/useTickets";
import { toast } from "sonner";

interface BookingActionsMenuProps {
  ticket: TicketWithDetails;
  onRecordPayment: (ticket: TicketWithDetails) => void;
}

export function BookingActionsMenu({ ticket, onRecordPayment }: BookingActionsMenuProps) {
  const navigate = useNavigate();

  const handleView = () => {
    navigate(`/bookings/${ticket.id}`);
  };

  const handleResendConfirmation = () => {
    toast.info("Bestätigung wird gesendet...");
    // TODO: Implement resend confirmation
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDuplicate = () => {
    toast.info("Buchung wird dupliziert...");
    // TODO: Navigate to wizard with pre-filled data
  };

  const handleCancel = () => {
    toast.info("Stornierung wird vorbereitet...");
    // TODO: Implement cancellation modal
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Aktionen öffnen</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleView}>
          <Eye className="mr-2 h-4 w-4" />
          Buchung anzeigen
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRecordPayment(ticket)}>
          <CreditCard className="mr-2 h-4 w-4" />
          Zahlung erfassen
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleResendConfirmation}>
          <Send className="mr-2 h-4 w-4" />
          Bestätigung erneut senden
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Ticket drucken
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDuplicate}>
          <Copy className="mr-2 h-4 w-4" />
          Duplizieren
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={handleCancel}
          className="text-destructive focus:text-destructive"
        >
          <XCircle className="mr-2 h-4 w-4" />
          Buchung stornieren
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
