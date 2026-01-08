import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, CreditCard, Smartphone, FileText, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DayBooking } from "@/hooks/useReconciliation";

const paymentIcons: Record<string, typeof Banknote> = {
  bar: Banknote,
  karte: CreditCard,
  twint: Smartphone,
  rechnung: FileText,
  gutschein: Ticket,
};

const paymentLabels: Record<string, string> = {
  bar: "Bar",
  karte: "Karte",
  twint: "TWINT",
  rechnung: "Rechnung",
  gutschein: "Gutschein",
};

interface DayBookingsTableProps {
  bookings: DayBooking[];
}

export function DayBookingsTable({ bookings }: DayBookingsTableProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>("all");

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const filteredBookings = filter === "all" 
    ? bookings 
    : bookings.filter((b) => b.payment_method === filter);

  const getPaymentIcon = (method: string | null) => {
    const Icon = paymentIcons[method || ""] || Banknote;
    return <Icon className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Buchungen</CardTitle>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Alle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="bar">Nur Bar</SelectItem>
            <SelectItem value="karte">Nur Karte</SelectItem>
            <SelectItem value="twint">Nur TWINT</SelectItem>
            <SelectItem value="rechnung">Nur Rechnung</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {filteredBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Keine Buchungen für diesen Tag
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Kunde</TableHead>
                <TableHead>Kurs</TableHead>
                <TableHead>Zahlung</TableHead>
                <TableHead className="text-right">CHF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow
                  key={booking.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/bookings/${booking.id}`)}
                >
                  <TableCell className="font-mono text-sm">
                    {booking.ticket_number}
                  </TableCell>
                  <TableCell>{booking.customer_name}</TableCell>
                  <TableCell>{booking.product_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getPaymentIcon(booking.payment_method)}
                      <span className="text-sm">
                        {paymentLabels[booking.payment_method || ""] || "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(booking.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
