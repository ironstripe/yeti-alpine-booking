import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

import { useBookingWizard, WizardStep } from "@/contexts/BookingWizardContext";
import { useCreateBooking } from "@/hooks/useCreateBooking";
import { useUpdateBooking, type NewParticipantItem, type TicketItemUpdate } from "@/hooks/useUpdateBooking";

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

  return false;
}

export function Step4Summary({ onEditStep }: Step4SummaryProps) {
  const navigate = useNavigate();
  const { state, setCurrentStep, resetWizard } = useBookingWizard();
  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();

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
    if (!state.isEditMode && !paymentMethod) {
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
      if (state.isEditMode && state.editingTicketId) {
        // UPDATE MODE: Use updateBooking hook
        const addedParticipantIds = state.selectedParticipants
          .filter(p => !state.originalParticipantIds.includes(p.id))
          .map(p => p.id);
        
        const removedParticipantIds = state.originalParticipantIds
          .filter(id => !state.selectedParticipants.some(p => p.id === id));

        // Build item updates from original items
        const itemUpdates: TicketItemUpdate[] = state.originalItems
          .filter(item => state.selectedParticipants.some(p => p.id === item.participantId))
          .map(item => ({
            id: item.id,
            instructorId: state.instructorId,
            meetingPoint: state.meetingPoint,
            internalNotes: state.internalNotes,
            instructorNotes: state.instructorNotes,
          }));

        // Build new participant items  
        const addedParticipants: NewParticipantItem[] = addedParticipantIds.map(participantId => {
          const participant = state.selectedParticipants.find(p => p.id === participantId);
          return {
            participantId,
            participantFirstName: participant?.first_name || "",
            dates: state.selectedDates,
            productId: state.productId || "",
            timeStart: state.timeSlot?.split(" - ")[0] || "10:00",
            timeEnd: state.timeSlot?.split(" - ")[1] || "12:00",
            instructorId: state.instructorId,
            meetingPoint: state.meetingPoint,
            unitPrice: 0, // Will be recalculated
          };
        });

        await updateBooking.mutateAsync({
          ticketId: state.editingTicketId,
          itemUpdates,
          addedParticipants,
          removedParticipantIds,
          internalNotes: state.internalNotes,
        });

        resetWizard();
        navigate(`/bookings/${state.editingTicketId}`);
      } else {
        // CREATE MODE: Use createBooking hook
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
      }
    } catch (error) {
      console.error("Failed to save booking:", error);
      toast.error(state.isEditMode ? "Fehler beim Speichern" : "Fehler beim Erstellen der Buchung");
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

      {/* Sticky Footer with action buttons */}
      <div className="sticky bottom-0 -mx-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(2)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>

          <Button 
            onClick={handleCreateBooking} 
            disabled={createBooking.isPending || updateBooking.isPending}
            className="min-w-[180px]"
          >
            {(createBooking.isPending || updateBooking.isPending) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {state.isEditMode ? "Wird gespeichert..." : "Wird erstellt..."}
              </>
            ) : (
              state.isEditMode ? "Änderungen speichern" : "Buchung erstellen"
            )}
          </Button>
        </div>
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
