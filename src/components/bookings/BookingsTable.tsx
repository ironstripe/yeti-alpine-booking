import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TicketWithDetails } from "@/hooks/useTickets";
import { BookingStatusBadge } from "./BookingStatusBadge";
import { BookingActionsMenu } from "./BookingActionsMenu";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface BookingsTableProps {
  tickets: TicketWithDetails[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  visibleColumns: string[];
  onRecordPayment: (ticket: TicketWithDetails) => void;
}

export function BookingsTable({
  tickets,
  selectedIds,
  onSelectionChange,
  visibleColumns,
  onRecordPayment,
}: BookingsTableProps) {
  const navigate = useNavigate();

  const isAllSelected = tickets.length > 0 && selectedIds.size === tickets.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < tickets.length;

  const toggleAll = () => {
    if (isAllSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(tickets.map((t) => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  };

  const formatDateRange = (dateRange: { start: string; end: string } | null) => {
    if (!dateRange) return "—";
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    if (dateRange.start === dateRange.end) {
      return format(start, "dd.MM.yyyy", { locale: de });
    }
    return `${format(start, "dd.MM.")} - ${format(end, "dd.MM.yyyy", { locale: de })}`;
  };

  const formatCourseInfo = (ticket: TicketWithDetails) => {
    if (!ticket.primaryProduct) return "—";
    const { name, type } = ticket.primaryProduct;
    
    // Get duration from first item
    const firstItem = ticket.items[0];
    const durationMinutes = firstItem?.product?.duration_minutes;
    const durationHours = durationMinutes ? Math.round(durationMinutes / 60) : null;

    if (type === "private") {
      return `Privat${durationHours ? ` (${durationHours}h)` : ""}`;
    }
    return name;
  };

  const formatInstructor = (ticket: TicketWithDetails) => {
    if (!ticket.primaryInstructor) {
      return <span className="text-muted-foreground">(offen)</span>;
    }
    const { firstName, lastName } = ticket.primaryInstructor;
    return `${firstName} ${lastName.charAt(0)}.`;
  };

  const isColumnVisible = (columnId: string) => visibleColumns.includes(columnId);

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={isAllSelected}
                ref={(el) => {
                  if (el) {
                    (el as any).indeterminate = isSomeSelected;
                  }
                }}
                onCheckedChange={toggleAll}
                aria-label="Alle auswählen"
              />
            </TableHead>
            {isColumnVisible("ticket") && <TableHead>Ticket</TableHead>}
            {isColumnVisible("customer") && <TableHead>Kunde</TableHead>}
            {isColumnVisible("course") && <TableHead>Kurs</TableHead>}
            {isColumnVisible("dateTime") && <TableHead>Datum & Zeit</TableHead>}
            {isColumnVisible("instructor") && <TableHead>Lehrer</TableHead>}
            {isColumnVisible("total") && <TableHead className="text-right">Total</TableHead>}
            {isColumnVisible("status") && <TableHead>Status</TableHead>}
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow
              key={ticket.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/bookings/${ticket.id}`)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(ticket.id)}
                  onCheckedChange={() => toggleOne(ticket.id)}
                  aria-label={`Ticket ${ticket.ticket_number} auswählen`}
                />
              </TableCell>

              {isColumnVisible("ticket") && (
                <TableCell>
                  <div className="font-medium text-primary">
                    {ticket.ticket_number}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ticket.participantCount} Teilnehmer
                  </div>
                </TableCell>
              )}

              {isColumnVisible("customer") && (
                <TableCell>
                  <div className="font-medium">
                    {ticket.customer.first_name} {ticket.customer.last_name}
                  </div>
                </TableCell>
              )}

              {isColumnVisible("course") && (
                <TableCell>
                  <div>{formatCourseInfo(ticket)}</div>
                </TableCell>
              )}

              {isColumnVisible("dateTime") && (
                <TableCell>
                  <div>{formatDateRange(ticket.dateRange)}</div>
                  {ticket.timeRange && (
                    <div className="text-xs text-muted-foreground">
                      {ticket.timeRange}
                    </div>
                  )}
                </TableCell>
              )}

              {isColumnVisible("instructor") && (
                <TableCell>{formatInstructor(ticket)}</TableCell>
              )}

              {isColumnVisible("total") && (
                <TableCell className="text-right font-medium">
                  CHF {(ticket.total_amount || 0).toFixed(2)}
                </TableCell>
              )}

              {isColumnVisible("status") && (
                <TableCell>
                  <BookingStatusBadge
                    status={ticket.status}
                    paymentStatus={ticket.computedPaymentStatus}
                    hasUnconfirmedInstructor={ticket.hasUnconfirmedInstructor}
                  />
                </TableCell>
              )}

              <TableCell onClick={(e) => e.stopPropagation()}>
                <BookingActionsMenu
                  ticket={ticket}
                  onRecordPayment={onRecordPayment}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
