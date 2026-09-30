import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Delivery {
  id: string;
  status: "pending" | "sending" | "sent" | "failed";
  last_error_code: string | null;
  last_error: string | null;
}

const ERROR_LABEL: Record<string, string> = {
  template_missing: "Vorlage fehlt oder ist inaktiv",
  template_unknown_variable: "Vorlage enthält unbekannte Platzhalter",
  provider_error: "Versanddienst hat abgelehnt",
  exception: "Technischer Fehler",
};

/** Shown only for website invoice bookings (they own a confirmation delivery row). */
export function BookingEmailDeliveryCard({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const { data: delivery } = useQuery({
    queryKey: ["booking-email-delivery", ticketId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("booking_email_deliveries")
        .select("id, status, last_error_code, last_error")
        .eq("ticket_id", ticketId)
        .eq("kind", "booking_confirmation")
        .maybeSingle();
      return (data as Delivery | null) ?? null;
    },
  });

  const { data: templateActive } = useQuery({
    queryKey: ["booking-confirmed-template-active"],
    enabled: delivery?.status === "failed",
    queryFn: async () => {
      const { data } = await supabase
        .from("email_templates")
        .select("id")
        .eq("trigger", "booking.confirmed")
        .eq("is_active", true)
        .maybeSingle();
      return !!data;
    },
  });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("retry-booking-confirmation", {
        body: { delivery_id: id },
      });
      if (error) throw new Error(error.message);
      return data as { success: boolean };
    },
    onSuccess: (d) => {
      if (d?.success) toast.success("Bestätigung gesendet");
      else toast.error("Versand erneut fehlgeschlagen");
      qc.invalidateQueries({ queryKey: ["booking-email-delivery", ticketId] });
    },
    onError: () => toast.error("Erneutes Senden nicht möglich"),
  });

  if (!delivery) return null;

  const statusBadge =
    delivery.status === "sent" ? <Badge>Gesendet</Badge> :
    delivery.status === "failed" ? <Badge variant="destructive">Fehlgeschlagen</Badge> :
    <Badge variant="secondary">Ausstehend</Badge>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          E-Mail-Versand
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">Buchungsbestätigung:</span>
            {statusBadge}
            {delivery.status === "failed" && delivery.last_error_code && (
              <span className="text-muted-foreground">
                ({ERROR_LABEL[delivery.last_error_code] ?? delivery.last_error_code})
              </span>
            )}
          </div>
          {delivery.status === "failed" && templateActive && (
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onClick={() => retry.mutate(delivery.id)}
            >
              <RotateCw className="mr-1 h-4 w-4" />
              Bestätigung erneut senden
            </Button>
          )}
        </div>
        <p className="text-muted-foreground">
          Rechnungsversand ausstehend – wird nach Zahlungsfreigabe aktiviert
        </p>
      </CardContent>
    </Card>
  );
}
