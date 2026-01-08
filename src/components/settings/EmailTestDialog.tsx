import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmailTemplate, useSendTestEmail } from "@/hooks/useEmailTemplates";

interface EmailTestDialogProps {
  template: EmailTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sample test data
const testData: Record<string, unknown> = {
  customer_name: "Max Mustermann",
  customer_first_name: "Max",
  customer_last_name: "Mustermann",
  customer_email: "max@example.com",
  request_number: "ANF-2026-00042",
  ticket_number: "T-2026-00123",
  requested_date: "15. Januar 2026",
  booking_time: "10:00 - 12:00",
  product_name: "Privatstunde 2h",
  instructor_name: "Hans Muster",
  payment_amount: "CHF 240.00",
  payment_due_date: "22. Januar 2026",
  voucher_code: "GS-2026-0001",
  voucher_value: "CHF 100.00",
  voucher_expiry: "31. Dezember 2026",
};

export function EmailTestDialog({ template, open, onOpenChange }: EmailTestDialogProps) {
  const [recipientEmail, setRecipientEmail] = useState("");
  const sendTestMutation = useSendTestEmail();

  const handleSend = () => {
    if (!template || !recipientEmail) return;

    sendTestMutation.mutate(
      {
        templateId: template.id,
        recipientEmail,
        testData,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setRecipientEmail("");
        },
      }
    );
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test-E-Mail senden</DialogTitle>
          <DialogDescription>
            Senden Sie eine Test-E-Mail mit Beispieldaten an eine E-Mail-Adresse.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Vorlage</Label>
            <Input id="template-name" value={template.name} disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient-email">Empfänger E-Mail</Label>
            <Input
              id="recipient-email"
              type="email"
              placeholder="test@example.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Hinweis: Im Testmodus können E-Mails nur an die Resend-Account-E-Mail gesendet werden.
            </p>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm font-medium mb-2">Verwendete Testdaten:</p>
            <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-auto">
              {Object.entries(testData).slice(0, 6).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="font-mono">{key}:</span>
                  <span>{String(value)}</span>
                </div>
              ))}
              <div className="text-muted-foreground/60">... und weitere</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSend}
            disabled={!recipientEmail || sendTestMutation.isPending}
          >
            {sendTestMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Senden...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Senden
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
