import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketWithDetails } from "@/hooks/useTickets";
import { useRecordPayment } from "@/hooks/useRecordPayment";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface PaymentModalProps {
  ticket: TicketWithDetails | null;
  onClose: () => void;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Bar" },
  { value: "card", label: "Karte" },
  { value: "twint", label: "TWINT" },
  { value: "invoice", label: "Rechnung" },
];

export function PaymentModal({ ticket, onClose }: PaymentModalProps) {
  const remainingAmount = ticket 
    ? (ticket.total_amount || 0) - (ticket.paid_amount || 0)
    : 0;

  const [amount, setAmount] = useState(remainingAmount.toString());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const { mutate: recordPayment, isPending } = useRecordPayment();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket) return;

    recordPayment(
      {
        ticketId: ticket.id,
        amount: parseFloat(amount),
        paymentMethod,
        paymentDate: new Date(paymentDate),
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          resetForm();
        },
      }
    );
  };

  const resetForm = () => {
    setAmount("");
    setPaymentMethod("cash");
    setPaymentDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
  };

  // Reset form when ticket changes
  if (ticket && parseFloat(amount) !== remainingAmount && amount === "") {
    setAmount(remainingAmount.toString());
  }

  return (
    <Dialog open={!!ticket} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Zahlung für Ticket {ticket?.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">
                CHF {(ticket?.total_amount || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bereits bezahlt:</span>
              <span>CHF {(ticket?.paid_amount || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t border-border mt-2 pt-2">
              <span>Offen:</span>
              <span className="text-primary">
                CHF {remainingAmount.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Zahlungsart</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Betrag (CHF)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              max={remainingAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentDate">Datum</Label>
            <Input
              id="paymentDate"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notiz (optional)</Label>
            <Textarea
              id="notes"
              placeholder="z.B. Teilzahlung via E-Banking"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending || parseFloat(amount) <= 0}>
              {isPending ? "Speichern..." : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
