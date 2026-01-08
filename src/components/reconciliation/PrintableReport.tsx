import { forwardRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { DaySummary, ReconciliationData } from "@/hooks/useReconciliation";

interface PrintableReportProps {
  date: Date;
  summary: DaySummary;
  reconciliation: ReconciliationData | null;
  cashActual: number;
  cardActual: number;
  twintActual: number;
  difference: number;
  differenceReason: string;
}

export const PrintableReport = forwardRef<HTMLDivElement, PrintableReportProps>(
  ({ date, summary, reconciliation, cashActual, cardActual, twintActual, difference, differenceReason }, ref) => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("de-CH", {
        style: "currency",
        currency: "CHF",
        minimumFractionDigits: 2,
      }).format(amount);
    };

    const paymentLabels: Record<string, string> = {
      bar: "Bargeld",
      karte: "Kreditkarte",
      twint: "TWINT",
      rechnung: "Rechnung",
      gutschein: "Gutschein",
    };

    const reconcilableExpected = 
      (summary.paymentBreakdown.find((p) => p.method === "bar")?.total || 0) +
      (summary.paymentBreakdown.find((p) => p.method === "karte")?.total || 0) +
      (summary.paymentBreakdown.find((p) => p.method === "twint")?.total || 0);

    const actualTotal = cashActual + cardActual + twintActual;

    return (
      <div ref={ref} className="print-report p-8 bg-white text-black text-sm hidden print:block">
        <style>{`
          @media print {
            .print-report { display: block !important; }
            .print-report table { border-collapse: collapse; width: 100%; }
            .print-report th, .print-report td { 
              border-bottom: 1px solid #ddd; 
              padding: 8px 4px; 
              text-align: left;
            }
            .print-report th { font-weight: 600; }
            .print-report .text-right { text-align: right; }
            .print-report .section { margin-bottom: 24px; }
            .print-report .section-title { 
              font-weight: 600; 
              border-bottom: 2px solid #333;
              padding-bottom: 4px;
              margin-bottom: 12px;
            }
          }
        `}</style>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold">SCHNEESPORTSCHULE MALBUN</h1>
          <h2 className="text-lg font-semibold mt-1">TAGESABSCHLUSS</h2>
          <p className="mt-2">{format(date, "EEEE, d. MMMM yyyy", { locale: de })}</p>
        </div>

        {/* Summary Section */}
        <div className="section">
          <div className="section-title">ZUSAMMENFASSUNG</div>
          <table>
            <tbody>
              <tr>
                <td>Tagesumsatz:</td>
                <td className="text-right">{formatCurrency(summary.totalRevenue)}</td>
              </tr>
              <tr>
                <td>Buchungen:</td>
                <td className="text-right">{summary.totalBookings}</td>
              </tr>
              <tr>
                <td>Skilehrer im Einsatz:</td>
                <td className="text-right">{summary.totalInstructors}</td>
              </tr>
              <tr>
                <td>Unterrichtsstunden:</td>
                <td className="text-right">{summary.totalHours.toFixed(0)}h</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payments Section */}
        <div className="section">
          <div className="section-title">ZAHLUNGEN</div>
          <table>
            <tbody>
              {summary.paymentBreakdown.map((payment) => (
                <tr key={payment.method}>
                  <td>{paymentLabels[payment.method] || payment.method}:</td>
                  <td className="text-right">{payment.count} ×</td>
                  <td className="text-right">{formatCurrency(payment.total)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid #333" }}>
                <td><strong>TOTAL:</strong></td>
                <td></td>
                <td className="text-right"><strong>{formatCurrency(summary.totalRevenue)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Cash Control Section */}
        <div className="section">
          <div className="section-title">KASSENKONTROLLE</div>
          <table>
            <tbody>
              <tr>
                <td>Soll (Bar + Karte + TWINT):</td>
                <td className="text-right">{formatCurrency(reconcilableExpected)}</td>
              </tr>
              <tr>
                <td>Ist (gezählt):</td>
                <td className="text-right">{formatCurrency(actualTotal)}</td>
              </tr>
              <tr>
                <td>Differenz:</td>
                <td className="text-right">{formatCurrency(difference)}</td>
              </tr>
              {differenceReason && (
                <tr>
                  <td colSpan={2}>Begründung: {differenceReason}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bookings Section */}
        <div className="section">
          <div className="section-title">BUCHUNGEN</div>
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Kunde</th>
                <th>Kurs</th>
                <th>Zahlung</th>
                <th className="text-right">CHF</th>
              </tr>
            </thead>
            <tbody>
              {summary.bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.ticket_number}</td>
                  <td>{booking.customer_name}</td>
                  <td>{booking.product_name}</td>
                  <td>{paymentLabels[booking.payment_method || ""] || "—"}</td>
                  <td className="text-right">{booking.total.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-12">
          {reconciliation?.closed_at && (
            <p>
              Abgeschlossen am: {format(new Date(reconciliation.closed_at), "dd.MM.yyyy, HH:mm 'Uhr'", { locale: de })}
            </p>
          )}
          {reconciliation?.closed_by_name && (
            <p>Abgeschlossen von: {reconciliation.closed_by_name}</p>
          )}

          <div className="flex justify-between mt-12">
            <div className="text-center">
              <div className="border-b border-black w-48 mb-1"></div>
              <span>Unterschrift Büro</span>
            </div>
            <div className="text-center">
              <div className="border-b border-black w-48 mb-1"></div>
              <span>Unterschrift Kassier</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

PrintableReport.displayName = "PrintableReport";
