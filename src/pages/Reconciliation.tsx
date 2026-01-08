import { useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, subDays, isToday, startOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { 
  useReconciliation, 
  useDaySummary, 
  useSaveReconciliation,
  useCloseReconciliation 
} from "@/hooks/useReconciliation";
import { ReconciliationSummaryCards } from "@/components/reconciliation/ReconciliationSummaryCards";
import { PaymentBreakdownTable } from "@/components/reconciliation/PaymentBreakdownTable";
import { CashDifferenceCard } from "@/components/reconciliation/CashDifferenceCard";
import { DayBookingsTable } from "@/components/reconciliation/DayBookingsTable";
import { InstructorHoursTable } from "@/components/reconciliation/InstructorHoursTable";
import { ReconciliationActions } from "@/components/reconciliation/ReconciliationActions";
import { PrintableReport } from "@/components/reconciliation/PrintableReport";
import { ShopSalesTable } from "@/components/reconciliation/ShopSalesTable";
import { useReactToPrint } from "react-to-print";
import { useDebounce } from "@/hooks/useDebounce";

export default function Reconciliation() {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const printRef = useRef<HTMLDivElement>(null);

  // Local state for form fields
  const [cashActual, setCashActual] = useState<number | null>(null);
  const [cardActual, setCardActual] = useState<number | null>(null);
  const [twintActual, setTwintActual] = useState<number | null>(null);
  const [differenceReason, setDifferenceReason] = useState("");
  const [differenceAcknowledged, setDifferenceAcknowledged] = useState(false);

  // Queries
  const { data: reconciliation, isLoading: reconciliationLoading } = useReconciliation(selectedDate);
  const { data: summary, isLoading: summaryLoading } = useDaySummary(selectedDate);

  // Mutations
  const saveReconciliation = useSaveReconciliation();
  const closeReconciliation = useCloseReconciliation();

  // Calculate expected amounts (bookings + shop combined)
  const getExpected = (method: string) => {
    const bookingAmount = summary?.paymentBreakdown.find((p) => p.method === method)?.total || 0;
    const shopAmount = summary?.shopPaymentBreakdown?.find((p) => p.method === method)?.total || 0;
    return bookingAmount + shopAmount;
  };

  const cashExpected = getExpected("bar");
  const cardExpected = getExpected("karte");
  const twintExpected = getExpected("twint");

  const totalExpected = cashExpected + cardExpected + twintExpected;
  const totalActual = (cashActual ?? 0) + (cardActual ?? 0) + (twintActual ?? 0);
  const difference = totalActual - totalExpected;

  const isLocked = reconciliation?.status === "closed";

  // Initialize form from existing reconciliation
  useEffect(() => {
    if (reconciliation) {
      setCashActual(reconciliation.cash_actual);
      setCardActual(reconciliation.card_actual);
      setTwintActual(reconciliation.twint_actual);
      setDifferenceReason(reconciliation.difference_reason || "");
      setDifferenceAcknowledged(reconciliation.difference_acknowledged);
    } else {
      // Reset to expected values for new reconciliation
      setCashActual(null);
      setCardActual(null);
      setTwintActual(null);
      setDifferenceReason("");
      setDifferenceAcknowledged(false);
    }
  }, [reconciliation]);

  // Auto-save debounced
  const debouncedCashActual = useDebounce(cashActual, 1000);
  const debouncedCardActual = useDebounce(cardActual, 1000);
  const debouncedTwintActual = useDebounce(twintActual, 1000);
  const debouncedDifferenceReason = useDebounce(differenceReason, 1000);

  useEffect(() => {
    if (isLocked) return;
    if (debouncedCashActual === null && debouncedCardActual === null && debouncedTwintActual === null) return;

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    saveReconciliation.mutate({
      date: dateStr,
      status: "open",
      total_revenue: summary?.totalRevenue || 0,
      total_bookings: summary?.totalBookings || 0,
      total_instructors: summary?.totalInstructors || 0,
      total_hours: summary?.totalHours || 0,
      cash_expected: cashExpected,
      cash_actual: debouncedCashActual,
      card_expected: cardExpected,
      card_actual: debouncedCardActual,
      twint_expected: twintExpected,
      twint_actual: debouncedTwintActual,
      difference: (debouncedCashActual ?? 0) + (debouncedCardActual ?? 0) + (debouncedTwintActual ?? 0) - totalExpected,
      difference_reason: debouncedDifferenceReason || null,
      difference_acknowledged: differenceAcknowledged,
    });
  }, [debouncedCashActual, debouncedCardActual, debouncedTwintActual, debouncedDifferenceReason]);

  // Print handler
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Tagesabschluss-${format(selectedDate, "yyyy-MM-dd")}`,
  });

  // Close day handler
  const handleCloseDay = () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    
    // First save the final state
    saveReconciliation.mutate({
      date: dateStr,
      status: "open",
      total_revenue: summary?.totalRevenue || 0,
      total_bookings: summary?.totalBookings || 0,
      total_instructors: summary?.totalInstructors || 0,
      total_hours: summary?.totalHours || 0,
      cash_expected: cashExpected,
      cash_actual: cashActual,
      card_expected: cardExpected,
      card_actual: cardActual,
      twint_expected: twintExpected,
      twint_actual: twintActual,
      difference,
      difference_reason: differenceReason || null,
      difference_acknowledged: differenceAcknowledged,
    }, {
      onSuccess: () => {
        // Then close it
        closeReconciliation.mutate({ 
          date: dateStr, 
          userName: "Büro" // TODO: Get from auth context
        });
      }
    });
  };

  // Determine if can close
  const canClose = (() => {
    // All actual amounts must be filled
    if (cashActual === null || cardActual === null || twintActual === null) {
      return false;
    }
    // If there's a difference, reason and acknowledgement required
    if (difference !== 0) {
      if (!differenceReason.trim() || !differenceAcknowledged) {
        return false;
      }
    }
    return true;
  })();

  const getClosingReason = () => {
    if (cashActual === null || cardActual === null || twintActual === null) {
      return "Bitte alle Ist-Beträge erfassen";
    }
    if (difference !== 0 && !differenceReason.trim()) {
      return "Begründung für Differenz erforderlich";
    }
    if (difference !== 0 && !differenceAcknowledged) {
      return "Differenz muss akzeptiert werden";
    }
    return undefined;
  };

  const getStatusBadge = () => {
    if (isLocked) {
      return <Badge variant="default" className="bg-green-600">🟢 Abgeschlossen</Badge>;
    }
    if (!summary || summary.totalBookings === 0) {
      return <Badge variant="secondary">⚪ Kein Umsatz</Badge>;
    }
    return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">🟡 Offen</Badge>;
  };

  const dateDisplay = format(selectedDate, "EEEE, d. MMMM yyyy", { locale: de });

  return (
    <>
      <PageHeader
        title="Tagesabschluss"
        description={dateDisplay}
        actions={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, 1))} disabled={isToday(selectedDate)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {!isToday(selectedDate) && (
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(startOfDay(new Date()))}>
                Heute
              </Button>
            )}
            {getStatusBadge()}
          </div>
        }
      />

      <div className="space-y-6">
        {/* Summary Cards */}
        <ReconciliationSummaryCards summary={summary} isLoading={summaryLoading} />

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment Breakdown */}
          <PaymentBreakdownTable
            breakdown={summary?.paymentBreakdown || []}
            shopBreakdown={summary?.shopPaymentBreakdown || []}
            cashActual={cashActual}
            cardActual={cardActual}
            twintActual={twintActual}
            onCashActualChange={setCashActual}
            onCardActualChange={setCardActual}
            onTwintActualChange={setTwintActual}
            isLocked={isLocked}
          />

          {/* Cash Difference */}
          <CashDifferenceCard
            expected={totalExpected}
            actual={totalActual}
            difference={difference}
            differenceReason={differenceReason}
            differenceAcknowledged={differenceAcknowledged}
            onDifferenceReasonChange={setDifferenceReason}
            onDifferenceAcknowledgedChange={setDifferenceAcknowledged}
            isLocked={isLocked}
          />
        </div>

        {/* Shop Sales - separate section */}
        {(summary?.shopSales?.length || 0) > 0 && (
          <ShopSalesTable
            sales={summary?.shopSales || []}
            breakdown={summary?.shopPaymentBreakdown || []}
            totalRevenue={summary?.shopRevenue || 0}
          />
        )}

        {/* Bookings Table */}
        <DayBookingsTable bookings={summary?.bookings || []} />

        {/* Instructor Hours */}
        <InstructorHoursTable 
          instructorHours={summary?.instructorHours || []} 
          date={selectedDate}
        />

        {/* Actions */}
        <ReconciliationActions
          canClose={canClose}
          isLocked={isLocked}
          onPrint={handlePrint}
          onClose={handleCloseDay}
          closingReason={getClosingReason()}
        />
      </div>

      {/* Printable Report (hidden) */}
      <PrintableReport
        ref={printRef}
        date={selectedDate}
        summary={summary || { totalRevenue: 0, totalBookings: 0, totalInstructors: 0, totalHours: 0, paymentBreakdown: [], bookings: [], instructorHours: [], shopRevenue: 0, shopSales: [], shopPaymentBreakdown: [] }}
        reconciliation={reconciliation}
        cashActual={cashActual ?? 0}
        cardActual={cardActual ?? 0}
        twintActual={twintActual ?? 0}
        difference={difference}
        differenceReason={differenceReason}
      />
    </>
  );
}
