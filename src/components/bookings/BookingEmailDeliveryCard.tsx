import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Delivery {
  id: string;
  kind: string;
  status: "pending" | "sending" | "sent" | "failed";
  last_error_code: string | null;
  last_error: string | null;
}

/** B+ Phase 1 (booking confirmation) and B+ Phase 2 (invoice with QR part). */
const KIND_LABEL: Record<string, string> = {
  booking_confirmation: "Buchungsbestätigung",
  invoice: "Rechnung mit QR-Zahlungsteil",
};

const KIND_ORDER = ["booking_confirmation", "invoice"];

const ERROR_LABEL: Record<string, string> = {
  template_missing: "Vorlage fehlt oder ist inaktiv",
  template_unknown_variable: "Vorlage enthält unbekannte Platzhalter",
  provider_error: "Versanddienst hat abgelehnt",
  exception: "Technischer Fehler",
  invoice_not_open: "Rechnung ist nicht mehr offen",
  invoice_missing: "Rechnung nicht gefunden",
  payment_snapshot_missing: "Zahlungsdaten der Rechnung fehlen",
  qr_render_failed: "QR-Code konnte nicht erzeugt werden",
  delivery_key_invalid: "Zustellschlüssel ist ungültig",
};

/** Shown for bookings that own server-side delivery rows (website flow). */
export function BookingEmailDeliveryCard({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const { data: deliveries = [] } = useQuery({
    queryKey: ["booking-email-deliveries", ticketId],
    queryFn: async () => {
      const { data } = await supabase
        .from("booking_email_deliveries")
        .select("id, kind, status, last_error_code, last_error")
        .eq("ticket_id", ticketId);
      const rows = ((data ?? []) as Delivery[]).slice();
      rows.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
      return rows;
    },
  });

  const failedKinds = deliveries.filter((d) => d.status === "failed").map((d) => d.kind);

  const { data: activeTemplates = {} } = useQuery({
    queryKey: ["delivery-template-activity", ticketId, failedKinds.join(",")],
    enabled: failedKinds.length > 0,
    queryFn: async () => {
      const triggers = failedKinds.map((kind) => (kind === "invoice" ? "invoice.created" : "booking.confirmed"));
      const { data } = await supabase
        .from("email_templates")
        .select("trigger")
        .in("trigger", triggers)
        .eq("is_active", true);
      return Object.fromEntries(
        (data ?? []).map((t) => [t.trigger === "invoice.created" ? "invoice" : "booking_confirmation", true]),
      ) as Record<string, boolean>;
    },
  });

  const retry = useMutation({
    mutationFn: async (delivery: Delivery) => {
      const { data, error } = await supabase.functions.invoke("retry-booking-confirmation", {
        body: { delivery_id: delivery.id },
      });
      if (error) throw new Error(error.message);
      return { ...(data as { success: boolean; status?: string }), kind: delivery.kind };
    },
    onSuccess: (d) => {
      const label = KIND_LABEL[d.kind] ?? d.kind;
      if (d?.success) toast.success(`${label} gesendet`);
      else toast.error(`${label}: Versand erneut fehlgeschlagen`);
      qc.invalidateQueries({ queryKey: ["booking-email-deliveries", ticketId] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
    onError: () => toast.error("Erneutes Senden nicht möglich"),
  });

  if (deliveries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          E-Mail-Versand
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {deliveries.map((delivery) => (
          <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{KIND_LABEL[delivery.kind] ?? delivery.kind}:</span>
              {delivery.status === "sent" ? (
                <Badge>Gesendet</Badge>
              ) : delivery.status === "failed" ? (
                <Badge variant="destructive">Fehlgeschlagen</Badge>
              ) : (
                <Badge variant="secondary">Ausstehend</Badge>
              )}
              {delivery.status === "failed" && delivery.last_error_code && (
                <span className="text-muted-foreground">
                  ({ERROR_LABEL[delivery.last_error_code] ?? delivery.last_error_code})
                </span>
              )}
            </div>
            {delivery.status === "failed" && activeTemplates[delivery.kind] && (
              <Button
                size="sm"
                variant="outline"
                disabled={retry.isPending}
                onClick={() => retry.mutate(delivery)}
              >
                <RotateCw className="mr-1 h-4 w-4" />
                Erneut senden
              </Button>
            )}
          </div>
        ))}
        <p className="text-muted-foreground">
          Bestätigung und Rechnung werden beim Abschluss der Buchung automatisch versendet. Die Rechnung enthält den
          Swiss-QR-Zahlungsteil des hinterlegten Bankkontos.
        </p>
      </CardContent>
    </Card>
  );
}