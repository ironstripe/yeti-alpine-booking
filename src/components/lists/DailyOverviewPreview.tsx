import { useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useReactToPrint } from "react-to-print";
import type { DailyBooking } from "@/hooks/useListsData";

interface DailyOverviewPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  bookings: DailyBooking[];
  showPaymentStatus: boolean;
  setShowPaymentStatus: (show: boolean) => void;
  showContact: boolean;
  setShowContact: (show: boolean) => void;
  showInternalNotes: boolean;
  setShowInternalNotes: (show: boolean) => void;
}

export function DailyOverviewPreview({
  open,
  onOpenChange,
  date,
  bookings,
  showPaymentStatus,
  setShowPaymentStatus,
  showContact,
  setShowContact,
  showInternalNotes,
  setShowInternalNotes,
}: DailyOverviewPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Tagesuebersicht-${format(date, "yyyy-MM-dd")}`,
  });

  const dateDisplay = format(date, "EEEE, d. MMMM yyyy", { locale: de });

  // Split bookings by morning/afternoon
  const morningBookings = bookings.filter((b) => {
    if (!b.timeStart) return true;
    const hour = parseInt(b.timeStart.split(":")[0]);
    return hour < 13;
  });

  const afternoonBookings = bookings.filter((b) => {
    if (!b.timeStart) return false;
    const hour = parseInt(b.timeStart.split(":")[0]);
    return hour >= 13;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const totalRevenue = bookings.reduce((sum, b) => sum + b.total, 0);
  const uniqueInstructors = new Set(bookings.map((b) => b.instructorName).filter(Boolean)).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Tagesübersicht · {format(date, "d. MMMM yyyy", { locale: de })}
          </DialogTitle>
        </DialogHeader>

        {/* Options */}
        <div className="space-y-3 border-b pb-4">
          <p className="text-sm font-medium">Optionen:</p>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="showPaymentStatus"
                checked={showPaymentStatus}
                onCheckedChange={(checked) => setShowPaymentStatus(checked === true)}
              />
              <Label htmlFor="showPaymentStatus" className="text-sm">
                Zahlungsstatus anzeigen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showContact"
                checked={showContact}
                onCheckedChange={(checked) => setShowContact(checked === true)}
              />
              <Label htmlFor="showContact" className="text-sm">
                Kundenkontakt anzeigen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="showInternalNotes"
                checked={showInternalNotes}
                onCheckedChange={(checked) => setShowInternalNotes(checked === true)}
              />
              <Label htmlFor="showInternalNotes" className="text-sm">
                Interne Bemerkungen anzeigen
              </Label>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="border rounded-lg p-6 bg-white" ref={printRef}>
          <div className="print-content">
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold">SCHNEESPORTSCHULE MALBUN</h1>
              <h2 className="text-lg font-semibold">TAGESÜBERSICHT</h2>
              <p className="text-muted-foreground">{dateDisplay}</p>
            </div>

            {bookings.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Keine Buchungen für diesen Tag
              </p>
            ) : (
              <>
                {/* Morning */}
                {morningBookings.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-bold text-sm mb-2 border-b pb-1">
                      VORMITTAG (10:00 - 12:00)
                    </h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 px-1">Zeit</th>
                          <th className="text-left py-1 px-1">Ticket</th>
                          <th className="text-left py-1 px-1">Kunde</th>
                          <th className="text-left py-1 px-1">Kurs</th>
                          <th className="text-left py-1 px-1">Lehrer</th>
                          {showPaymentStatus && <th className="text-left py-1 px-1">Status</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {morningBookings.map((booking) => (
                          <tr key={booking.id} className="border-b border-dashed">
                            <td className="py-1 px-1">{booking.timeStart || "—"}</td>
                            <td className="py-1 px-1 font-mono text-xs">{booking.ticketNumber}</td>
                            <td className="py-1 px-1">{booking.customerName}</td>
                            <td className="py-1 px-1">{booking.productName}</td>
                            <td className="py-1 px-1">{booking.instructorName || "—"}</td>
                            {showPaymentStatus && (
                              <td className="py-1 px-1">{booking.paymentStatus || "—"}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Afternoon */}
                {afternoonBookings.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-bold text-sm mb-2 border-b pb-1">
                      NACHMITTAG (14:00 - 16:00)
                    </h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 px-1">Zeit</th>
                          <th className="text-left py-1 px-1">Ticket</th>
                          <th className="text-left py-1 px-1">Kunde</th>
                          <th className="text-left py-1 px-1">Kurs</th>
                          <th className="text-left py-1 px-1">Lehrer</th>
                          {showPaymentStatus && <th className="text-left py-1 px-1">Status</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {afternoonBookings.map((booking) => (
                          <tr key={booking.id} className="border-b border-dashed">
                            <td className="py-1 px-1">{booking.timeStart || "—"}</td>
                            <td className="py-1 px-1 font-mono text-xs">{booking.ticketNumber}</td>
                            <td className="py-1 px-1">{booking.customerName}</td>
                            <td className="py-1 px-1">{booking.productName}</td>
                            <td className="py-1 px-1">{booking.instructorName || "—"}</td>
                            {showPaymentStatus && (
                              <td className="py-1 px-1">{booking.paymentStatus || "—"}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Summary */}
                <div className="border-t-2 pt-4">
                  <h3 className="font-bold text-sm mb-2">ZUSAMMENFASSUNG</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p>Privatstunden: {bookings.length}</p>
                    <p>Skilehrer im Einsatz: {uniqueInstructors}</p>
                    <p>Erwarteter Umsatz: {formatCurrency(totalRevenue)}</p>
                  </div>
                </div>
              </>
            )}

            <div className="mt-6 pt-4 border-t text-sm text-muted-foreground">
              <p>
                Erstellt: {format(new Date(), "dd.MM.yyyy, HH:mm", { locale: de })} Uhr
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-2" />
            Drucken
          </Button>
          <Button variant="outline" onClick={() => handlePrint()}>
            <Download className="h-4 w-4 mr-2" />
            Als PDF speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
