import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardTaskCard } from "./DashboardTaskCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OpenBooking {
  id: string;
  ticket_number: string;
  status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  customer_name: string;
  issue: string;
}

function getBookingIssue(paidAmount: number, totalAmount: number): string {
  if (paidAmount === 0) {
    return `Offen: CHF ${totalAmount.toFixed(0)}`;
  }
  if (paidAmount < totalAmount) {
    return `Teilbezahlt: CHF ${paidAmount.toFixed(0)} / ${totalAmount.toFixed(0)}`;
  }
  return "Prüfung erforderlich";
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
          total_amount,
          paid_amount,
          customers (first_name, last_name)
        `
        )
        .neq("status", "cancelled")
        .gt("total_amount", 0)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      // Filter client-side for unpaid bookings
      const unpaidTickets = (data || []).filter(
        (ticket) => (ticket.paid_amount || 0) < (ticket.total_amount || 0)
      );

      return unpaidTickets.map((ticket) => {
        const paidAmount = ticket.paid_amount || 0;
        const totalAmount = ticket.total_amount || 0;
        
        return {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
          total_amount: ticket.total_amount,
          paid_amount: ticket.paid_amount,
          customer_name: ticket.customers
            ? `${ticket.customers.first_name || ""} ${ticket.customers.last_name}`.trim()
            : "Unbekannt",
          issue: getBookingIssue(paidAmount, totalAmount),
        };
      });
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
      <ScrollArea className="h-[200px]">
        <div className="space-y-2 pr-2">
          {openBookings?.map((booking) => (
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
        </div>
      </ScrollArea>

      {count > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs mt-2"
          onClick={() => navigate("/bookings?status=open")}
        >
          Alle in Buchungsliste anzeigen
          <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </DashboardTaskCard>
  );
}
