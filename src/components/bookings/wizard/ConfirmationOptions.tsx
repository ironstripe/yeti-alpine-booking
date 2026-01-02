import { Mail, MessageCircle, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

import { useBookingWizard } from "@/contexts/BookingWizardContext";

interface ConfirmationOptionsProps {
  sendCustomerEmail: boolean;
  sendCustomerWhatsApp: boolean;
  notifyInstructor: boolean;
  onSendCustomerEmailChange: (value: boolean) => void;
  onSendCustomerWhatsAppChange: (value: boolean) => void;
  onNotifyInstructorChange: (value: boolean) => void;
}

export function ConfirmationOptions({
  sendCustomerEmail,
  sendCustomerWhatsApp,
  notifyInstructor,
  onSendCustomerEmailChange,
  onSendCustomerWhatsAppChange,
  onNotifyInstructorChange,
}: ConfirmationOptionsProps) {
  const { state } = useBookingWizard();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Bestätigungen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Customer Confirmation */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="send-email"
              checked={sendCustomerEmail}
              onCheckedChange={(checked) => onSendCustomerEmailChange(checked === true)}
            />
            <div className="flex-1">
              <label htmlFor="send-email" className="cursor-pointer text-sm font-medium">
                Buchungsbestätigung an Kunde senden
              </label>
              {state.customer?.email && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {state.customer.email}
                </p>
              )}
            </div>
          </div>

          {sendCustomerEmail && state.customer?.phone && (
            <div className="ml-6 flex items-start gap-3">
              <Checkbox
                id="send-whatsapp"
                checked={sendCustomerWhatsApp}
                onCheckedChange={(checked) => onSendCustomerWhatsAppChange(checked === true)}
              />
              <label htmlFor="send-whatsapp" className="cursor-pointer text-sm">
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  Auch per WhatsApp ({state.customer.phone})
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Instructor Notification */}
        {state.productType === "private" && state.instructor && (
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="notify-instructor"
                checked={notifyInstructor}
                onCheckedChange={(checked) => onNotifyInstructorChange(checked === true)}
              />
              <div className="flex-1">
                <label htmlFor="notify-instructor" className="cursor-pointer text-sm font-medium">
                  Skilehrer über Buchung informieren
                </label>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MessageCircle className="h-3 w-3" />
                  {state.instructor.first_name} {state.instructor.last_name} per WhatsApp
                </p>
              </div>
            </div>
            {notifyInstructor && (
              <div className="ml-6 flex items-start gap-2 rounded-lg bg-amber-50 p-2 dark:bg-amber-950/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Skilehrer muss Buchung bestätigen
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}