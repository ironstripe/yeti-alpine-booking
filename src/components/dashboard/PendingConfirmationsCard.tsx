import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  User, 
  ChevronRight, 
  CheckCircle,
  Loader2,
  Mail,
  MessageCircle
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

interface PendingConfirmation {
  ticket_id: string;
  ticket_number: string;
  status: string;
  created_at: string;
  total_amount: number | null;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  conversation_id: string | null;
  source_channel: string | null;
  item_count: number;
}

export function PendingConfirmationsCard() {
  const navigate = useNavigate();

  const { data: pendingConfirmations, isLoading } = useQuery({
    queryKey: ["pending-confirmations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_booking_confirmations")
        .select("*")
        .limit(5);

      if (error) throw error;
      return data as PendingConfirmation[];
    },
    refetchInterval: 30000,
  });

  const handleApprove = (ticketId: string) => {
    navigate(`/bookings/${ticketId}?action=approve`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            Wartende Bestätigungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const count = pendingConfirmations?.length || 0;

  if (count === 0) {
    return null; // Don't show card if no pending confirmations
  }

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            Wartende Bestätigungen
          </CardTitle>
          <Badge variant="secondary" className="bg-orange-100 text-orange-700">
            {count} offen
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {pendingConfirmations?.map((confirmation) => (
          <div
            key={confirmation.ticket_id}
            className="flex items-center justify-between p-2 bg-background rounded-lg border"
          >
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">
                  {confirmation.ticket_number}
                </span>
                {confirmation.source_channel && (
                  <Badge variant="outline" className="text-xs">
                    {confirmation.source_channel === "whatsapp" ? (
                      <MessageCircle className="h-3 w-3 mr-1" />
                    ) : (
                      <Mail className="h-3 w-3 mr-1" />
                    )}
                    {confirmation.source_channel === "whatsapp" ? "WA" : "E-Mail"}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  <User className="h-3 w-3" />
                  {confirmation.customer_name}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(parseISO(confirmation.created_at), "dd.MM., HH:mm", { locale: de })}
                </span>
              </div>
              {confirmation.total_amount && confirmation.total_amount > 0 && (
                <div className="text-xs font-medium">
                  CHF {confirmation.total_amount.toFixed(2)}
                </div>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => handleApprove(confirmation.ticket_id)}
              className="bg-orange-500 hover:bg-orange-600 ml-2"
            >
              Prüfen
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        ))}
        
        {count > 5 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => navigate("/bookings?status=pending_confirmation")}
          >
            Alle {count} anzeigen
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
