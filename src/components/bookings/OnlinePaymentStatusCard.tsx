import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/swiss-qr-utils";

interface Session {
  id: string;
  provider: string;
  provider_session_id: string;
  amount: number;
  currency: string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  created: { label: "Offen", variant: "secondary" },
  processing: { label: "In Bearbeitung", variant: "secondary" },
  succeeded: { label: "Bezahlt", variant: "default" },
  failed: { label: "Fehlgeschlagen", variant: "destructive" },
  expired: { label: "Abgelaufen", variant: "outline" },
  refunded: { label: "Rückerstattet", variant: "outline" },
};

/**
 * Read-only view of the website payment attempts (B+ Phase 2). Payment state is
 * written exclusively by the verified provider webhook and by confirm-booking.
 */
export function OnlinePaymentStatusCard({ ticketId }: { ticketId: string }) {
  const { data: sessions = [] } = useQuery({
    queryKey: ["payment-sessions", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_sessions")
        .select("id, provider, provider_session_id, amount, currency, status, expires_at, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as unknown as Session[];
    },
  });

  if (sessions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Onlinezahlung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {sessions.map((session) => {
          const meta = STATUS_LABEL[session.status] ?? { label: session.status, variant: "secondary" as const };
          return (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {session.currency} {formatCurrency(Number(session.amount) || 0)}
                </span>
                <Badge variant={meta.variant}>{meta.label}</Badge>
                <span className="text-muted-foreground">
                  {format(new Date(session.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                </span>
              </div>
              <code className="text-xs text-muted-foreground">{session.provider_session_id}</code>
            </div>
          );
        })}
        <p className="text-muted-foreground">
          Zahlungen werden ausschliesslich serverseitig über den Zahlungsprovider bestätigt (Webhook). Dieser Bereich ist
          eine reine Anzeige.
        </p>
      </CardContent>
    </Card>
  );
}
