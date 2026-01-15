import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Send, 
  FileText, 
  Loader2, 
  Mail,
  MessageCircle 
} from "lucide-react";
import { toast } from "sonner";

interface BookingApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: {
    id: string;
    ticket_number: string;
    customer_name: string;
    customer_email: string;
    total_amount: number;
    source_channel?: string;
  };
  onApproved?: () => void;
}

export function BookingApprovalModal({
  open,
  onOpenChange,
  ticket,
  onApproved,
}: BookingApprovalModalProps) {
  const queryClient = useQueryClient();
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [sendInvoice, setSendInvoice] = useState(true);
  const [customMessage, setCustomMessage] = useState("");

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "approve-booking-confirmation",
        {
          body: {
            ticketId: ticket.id,
            sendConfirmation,
            sendInvoice,
            customMessage: customMessage || undefined,
          },
        }
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      toast.success(`Buchung ${ticket.ticket_number} bestätigt`);
      queryClient.invalidateQueries({ queryKey: ["pending-confirmations"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", ticket.id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      onOpenChange(false);
      onApproved?.();
    },
    onError: (error) => {
      console.error("Approval error:", error);
      toast.error("Fehler beim Bestätigen der Buchung");
    },
  });

  const ChannelIcon = ticket.source_channel === "whatsapp" ? MessageCircle : Mail;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Buchung bestätigen
          </DialogTitle>
          <DialogDescription>
            Bestätigen Sie die Buchung und wählen Sie die Versandoptionen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Booking Summary */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium">{ticket.ticket_number}</span>
              <Badge variant="outline" className="flex items-center gap-1">
                <ChannelIcon className="h-3 w-3" />
                {ticket.source_channel === "whatsapp" ? "WhatsApp" : "E-Mail"}
              </Badge>
            </div>
            <p className="text-sm font-medium">{ticket.customer_name}</p>
            <p className="text-sm text-muted-foreground">{ticket.customer_email}</p>
            <div className="text-lg font-bold">
              CHF {ticket.total_amount.toFixed(2)}
            </div>
          </div>

          <Separator />

          {/* Send Options */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Versandoptionen</p>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendConfirmation"
                checked={sendConfirmation}
                onCheckedChange={(checked) => setSendConfirmation(!!checked)}
              />
              <Label htmlFor="sendConfirmation" className="flex items-center gap-2 cursor-pointer">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Buchungsbestätigung senden
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendInvoice"
                checked={sendInvoice}
                onCheckedChange={(checked) => setSendInvoice(!!checked)}
              />
              <Label htmlFor="sendInvoice" className="flex items-center gap-2 cursor-pointer">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Rechnung mit QR-Code senden
              </Label>
            </div>
          </div>

          {/* Custom Message */}
          <div className="space-y-2">
            <Label htmlFor="customMessage">
              Persönliche Nachricht (optional)
            </Label>
            <Textarea
              id="customMessage"
              placeholder="Zusätzliche Nachricht an den Kunden..."
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {approveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Bestätigen & Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
