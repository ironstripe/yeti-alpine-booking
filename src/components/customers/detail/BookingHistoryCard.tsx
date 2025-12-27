import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Receipt, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ticket } from "@/hooks/useCustomerDetail";
import { Skeleton } from "@/components/ui/skeleton";

interface BookingHistoryCardProps {
  tickets: Ticket[];
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "secondary" },
  confirmed: { label: "Bestätigt", variant: "default" },
  paid: { label: "Bezahlt", variant: "default" },
  partially_paid: { label: "Teilweise bezahlt", variant: "outline" },
  cancelled: { label: "Storniert", variant: "destructive" },
};

export function BookingHistoryCard({ tickets, isLoading }: BookingHistoryCardProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buchungshistorie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Buchungshistorie</CardTitle>
          <Badge variant="secondary">{tickets.length}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {tickets.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">Noch keine Buchungen</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Hier erscheinen alle Buchungen dieses Kunden
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => {
              const statusConfig = STATUS_CONFIG[ticket.status || "draft"] || STATUS_CONFIG.draft;
              
              return (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/bookings/${ticket.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">
                        {ticket.ticket_number}
                      </span>
                      <Badge variant={statusConfig.variant}>
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {format(new Date(ticket.created_at), "d. MMMM yyyy", {
                        locale: de,
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      CHF {(ticket.total_amount || 0).toFixed(2)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
