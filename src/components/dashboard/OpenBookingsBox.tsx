import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardTaskCard } from "./DashboardTaskCard";
import { Skeleton } from "@/components/ui/skeleton";

interface OpenBooking {
  id: string;
  ticket_number: string;
  status: string | null;
  customer_name: string;
  issue: string;
}

function getBookingIssue(status: string | null): string {
  switch (status) {
    case "draft":
      return "Entwurf - nicht abgeschlossen";
    case "incomplete":
      return "Unvollständig";
    case "pending_instructor":
      return "Lehrer fehlt";
    case "pending_payment":
      return "Zahlung ausstehend";
    default:
      return "Prüfung erforderlich";
  }
}

export function OpenBookingsBox() {
  const navigate = useNavigate();

  const { data: openBookings, isLoading } = useQuery({
    queryKey: ["open-bookings-dashboard"],
    queryFn: async (): Promise<OpenBooking[]> => {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          `
          id,
          ticket_number,
          status,
          customers (first_name, last_name)
        `
        )
        .in("status", ["draft", "incomplete", "pending_instructor", "pending_payment"])
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      return (data || []).map((ticket) => ({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        customer_name: ticket.customers
          ? `${ticket.customers.first_name || ""} ${ticket.customers.last_name}`.trim()
          : "Unbekannt",
        issue: getBookingIssue(ticket.status),
      }));
    },
  });

  if (isLoading) {
    return (
      <DashboardTaskCard title="Offene Buchungen" count={0}>
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </DashboardTaskCard>
    );
  }

  const count = openBookings?.length || 0;

  return (
    <DashboardTaskCard
      title="Offene Buchungen"
      count={count}
      isEmpty={count === 0}
      emptyMessage="Keine offenen Buchungen"
    >
      <div className="space-y-2">
        {openBookings?.slice(0, 3).map((booking) => (
          <div
            key={booking.id}
            className="flex items-start justify-between gap-2 p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/bookings/${booking.id}`)}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {booking.ticket_number}{" "}
                <span className="text-muted-foreground font-normal">
                  ({booking.customer_name})
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{booking.issue}</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0">
              Bearbeiten →
            </Button>
          </div>
        ))}

        {count > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => navigate("/bookings?status=open")}
          >
            Alle {count} anzeigen
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
    </DashboardTaskCard>
  );
}
