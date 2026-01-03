import { useState, useMemo } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

import { useBookingWizard, WizardStep } from "@/contexts/BookingWizardContext";
import { useCreateBooking } from "@/hooks/useCreateBooking";

import { BookingSummaryCards } from "./BookingSummaryCards";
import { PriceBreakdown } from "./PriceBreakdown";
import { DiscountSection } from "./DiscountSection";
import { PaymentMethodSelection } from "./PaymentMethodSelection";
import { ConfirmationOptions } from "./ConfirmationOptions";
import { BookingSuccessModal } from "./BookingSuccessModal";
import { BookingWarnings, type BookingWarning } from "./BookingWarnings";

interface Step4SummaryProps {
  onEditStep: (step: WizardStep) => void;
}

// Check if booking qualifies for 2x2h discount
function check2x2hDiscount(
  duration: number | null,
  selectedDates: string[],
  appointments: { date: string; durationMinutes: number }[] | null
): boolean {
  // If using appointments mode (from scheduler)
  if (appointments && appointments.length > 0) {
    // Group by date and check for 2x 2h blocks on the same day
    const byDate = appointments.reduce((acc, apt) => {
      if (!acc[apt.date]) acc[apt.date] = [];
      acc[apt.date].push(apt.durationMinutes);
      return acc;
    }, {} as Record<string, number[]>);

    return Object.values(byDate).some((durations) => {
      const twoHourBlocks = durations.filter((d) => d === 120);
      return twoHourBlocks.length >= 2;
    });
  }

  // Simple mode: same duration across all dates
  // 2x2h discount only applies if duration is 2h and we have bookings
  // that when combined on same day equal 2x2h
  // For simple mode, user would need to book 2h twice on same day
  // which currently isn't supported in simple mode (single duration selection)
  // So for now, this only triggers in complex/appointments mode
  return false;
}

export function Step4Summary({ onEditStep }: Step4SummaryProps) {
  const { state, resetWizard } = useBookingWizard();
  const createBooking = useCreateBooking();

  // Local state for Step 4 fields (not in context to keep it simpler)
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "twint" | "invoice" | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentDueDate, setPaymentDueDate] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [sendCustomerEmail, setSendCustomerEmail] = useState(true);
  const [sendCustomerWhatsApp, setSendCustomerWhatsApp] = useState(false);
  const [notifyInstructor, setNotifyInstructor] = useState(true);
  const [createAnother, setCreateAnother] = useState(false);

  // Success modal state
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<{ id: string; number: string } | null>(null);

  // Check for automatic 2x2h discount
  const qualifiesFor2x2hDiscount = useMemo(() => {
    return check2x2hDiscount(state.duration, state.selectedDates, state.appointments);
  }, [state.duration, state.selectedDates, state.appointments]);

  const autoDiscountPercent = qualifiesFor2x2hDiscount ? 10 : 0;
  const autoDiscountReason = qualifiesFor2x2hDiscount ? "2x2h Tagesrabatt" : undefined;

  // Build warnings for summary
  const warnings = useMemo<BookingWarning[]>(() => {
    const result: BookingWarning[] = [];

    if (qualifiesFor2x2hDiscount) {
      result.push({
        id: "2x2h-discount",
        type: "info",
        icon: "discount",
        message: "2x2h Tagesrabatt automatisch angewendet: 10% Ermässigung",
      });
    }

    return result;
  }, [qualifiesFor2x2hDiscount]);

  const handleDiscountChange = (percent: number, reason: string) => {
    setDiscountPercent(percent);
    setDiscountReason(reason);
  };

  const handleCreateBooking = async () => {
    if (!paymentMethod) {
      toast.error("Bitte wähle eine Zahlungsart");
      return;
    }

    if (discountPercent > 0 && !discountReason.trim()) {
      toast.error("Bitte gib einen Grund für den Rabatt an");
      return;
    }

    // Combine manual + auto discount
    const totalDiscount = discountPercent + autoDiscountPercent;
    const combinedReason = [
      autoDiscountReason,
      discountReason,
    ].filter(Boolean).join(", ");

    try {
      const result = await createBooking.mutateAsync({
        ...state,
        paymentMethod,
        isPaid,
        paymentDueDate,
        discountPercent: totalDiscount,
        discountReason: combinedReason,
        sendCustomerEmail,
        sendCustomerWhatsApp,
        notifyInstructor,
      });

      setCreatedTicket({ id: result.ticketId, number: result.ticketNumber });
      setShowSuccess(true);
    } catch (error) {
      console.error("Failed to create booking:", error);
      toast.error("Fehler beim Erstellen der Buchung");
    }
  };

  const handleNewBooking = () => {
    setShowSuccess(false);
    resetWizard();
  };

  const firstCourseDate = state.selectedDates.length > 0 
    ? state.selectedDates.sort()[0] 
    : null;

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Buchung abschliessen</h2>
        <p className="text-sm text-muted-foreground">
          Bitte überprüfe alle Angaben vor dem Abschluss
        </p>
      </div>

      {/* Auto-discount and other warnings */}
      <BookingWarnings warnings={warnings} />

      {/* Summary Cards */}
      <BookingSummaryCards onEditStep={onEditStep} />

      <Separator />

      {/* Price Breakdown */}
      <PriceBreakdown
        discountPercent={discountPercent}
        autoDiscountPercent={autoDiscountPercent}
        autoDiscountReason={autoDiscountReason}
      />

      {/* Discount */}
      <DiscountSection
        discountPercent={discountPercent}
        discountReason={discountReason}
        onDiscountChange={handleDiscountChange}
      />

      <Separator />

      {/* Payment Method */}
      <PaymentMethodSelection
        paymentMethod={paymentMethod}
        isPaid={isPaid}
        paymentDueDate={paymentDueDate}
        onPaymentMethodChange={setPaymentMethod}
        onIsPaidChange={setIsPaid}
        onPaymentDueDateChange={setPaymentDueDate}
        firstCourseDate={firstCourseDate}
      />

      <Separator />

      {/* Confirmation Options */}
      <ConfirmationOptions
        sendCustomerEmail={sendCustomerEmail}
        sendCustomerWhatsApp={sendCustomerWhatsApp}
        notifyInstructor={notifyInstructor}
        onSendCustomerEmailChange={setSendCustomerEmail}
        onSendCustomerWhatsAppChange={setSendCustomerWhatsApp}
        onNotifyInstructorChange={setNotifyInstructor}
      />

      {/* Create Another Checkbox */}
      <div className="flex items-center justify-center gap-3 py-4">
        <Checkbox
          id="create-another"
          checked={createAnother}
          onCheckedChange={(checked) => setCreateAnother(checked === true)}
        />
        <label htmlFor="create-another" className="cursor-pointer text-sm">
          Nach Abschluss weitere Buchung erstellen
        </label>
      </div>

      {/* Success Modal */}
      {createdTicket && (
        <BookingSuccessModal
          open={showSuccess}
          ticketNumber={createdTicket.number}
          ticketId={createdTicket.id}
          customerEmail={sendCustomerEmail ? state.customer?.email || null : null}
          instructorName={
            notifyInstructor && state.instructor
              ? `${state.instructor.first_name} ${state.instructor.last_name}`
              : null
          }
          onClose={() => setShowSuccess(false)}
          onNewBooking={handleNewBooking}
        />
      )}
    </div>
  );
}
