import { customerEmailRecipient } from "@/lib/customerEmail";
import { checkoutSubmitFlags } from "@/lib/checkoutSubmitFlags";
import { checkoutFirstCourseDate, checkoutPaymentDueDate } from "@/lib/checkoutDueDate";
import { bookingConfirmation, type ConfirmationResult } from "@/lib/bookingConfirmationApi";
import { useState, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useParticipantOwnership } from "@/hooks/useParticipantOwnership";
import { resolveLinkedParticipants } from "@/lib/linkedParticipants";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

import { useBookingWizard, WizardStep } from "@/contexts/BookingWizardContext";
import { useCreateBooking } from "@/hooks/useCreateBooking";
import { useUpdateBooking, type NewParticipantItem, type TicketItemUpdate } from "@/hooks/useUpdateBooking";
import type { PaymentMethod, SettlementChoice } from "@/lib/finance";


import { BookingSummaryCards } from "./BookingSummaryCards";
import { PriceBreakdown } from "./PriceBreakdown";
import { DiscountSection } from "./DiscountSection";
import { PaymentMethodSelection } from "./PaymentMethodSelection";
import { ConfirmationOptions } from "./ConfirmationOptions";
import { useAssignedTeacherNames } from "@/hooks/useAssignedTeacherNames";
import { BookingSuccessModal } from "./BookingSuccessModal";
import { BookingWarnings, type BookingWarning } from "./BookingWarnings";
import { PrivateServerQuote } from "./PrivateServerQuote";
import { useQueryClient } from "@tanstack/react-query";
import { PrivateAppointmentError } from "@/lib/privateAppointmentsApi";
import { privateTariffsLive } from "@/lib/privateTariffRules";
import { buildServerPrivateSlots, discountOverrideFor } from "@/lib/serverPrivateSlots";
import type { CreateQuote, PaSlot } from "@/lib/privateAppointmentsApi";
import { OfficeCartQuote, type OfficeCartReady } from "./OfficeCartQuote";
import { officeCreate, officeMultiItemLive, OfficeBookingError } from "@/lib/officeBookingApi";
import { beginOfficeAttempt, readPendingOfficeAttempt, settleOfficeAttempt, type PendingOfficeAttempt } from "@/lib/officeCartRequest";

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
  const { state, setCurrentStep, resetWizard, setCheckoutOptions } = useBookingWizard();
  const teacherNames = useAssignedTeacherNames();
  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();

  // Checkout choices live in the wizard context so they survive step navigation (this step unmounts).
  const {
    paymentMethod, settlement, billingPartnerId, paymentDueDate, discountPercent, discountReason, discountExplicit,
    sendCustomerEmail, sendCustomerWhatsApp, notifyInstructor, createAnother,
  } = state;
  const setPaymentMethod = (v: PaymentMethod) => setCheckoutOptions({ paymentMethod: v });
  const setSettlement = (v: SettlementChoice) => setCheckoutOptions({ settlement: v });
  const setBillingPartnerId = (v: string | null) => setCheckoutOptions({ billingPartnerId: v });
  const setPaymentDueDate = (v: string | null) => setCheckoutOptions({ paymentDueDate: v });
  const setSendCustomerEmail = (v: boolean) => setCheckoutOptions({ sendCustomerEmail: v });
  const setSendCustomerWhatsApp = (v: boolean) => setCheckoutOptions({ sendCustomerWhatsApp: v });
  const setNotifyInstructor = (v: boolean) => setCheckoutOptions({ notifyInstructor: v });
  const setCreateAnother = (v: boolean) => setCheckoutOptions({ createAnother: v });

  // Success modal state
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<{ id: string; number: string } | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const submitLock = useRef(false);

  // Check for automatic 2x2h discount
  const qualifiesFor2x2hDiscount = useMemo(() => {
    // Canonical private plans are priced by the server per appointment; no client-side auto discount.
    if (state.productType === "private" && state.appointments) return false;
    return check2x2hDiscount(state.duration, state.selectedDates, state.appointments);
  }, [state.productType, state.duration, state.selectedDates, state.appointments]);

  // Mirrors useCreateBooking: server-priced private path (manual discount only, no auto 2x2h).
  const usesServerPrivatePath =
    !state.isEditMode &&
    state.productType === "private" &&
    !(state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0) &&
    !(state.privateGroupProposal && state.privateGroupProposal.groups.length > 1);

  const autoDiscountPercent = qualifiesFor2x2hDiscount && !usesServerPrivatePath ? 10 : 0;
  const autoDiscountReason = autoDiscountPercent > 0 ? "2x2h Tagesrabatt" : undefined;

  // Build warnings for summary
  const warnings = useMemo<BookingWarning[]>(() => {
    const result: BookingWarning[] = [];

    if (autoDiscountPercent > 0) {
      result.push({
        id: "2x2h-discount",
        type: "info",
        icon: "discount",
        message: "2x2h Tagesrabatt automatisch angewendet: 10% Ermässigung",
      });
    }

    return result;
  }, [autoDiscountPercent]);

  const handleDiscountChange = (percent: number, reason: string, explicit = true) => {
    setCheckoutOptions({ discountPercent: percent, discountReason: reason, discountExplicit: explicit });
  };

  // Private submit links exactly the participants applied to the active lesson in step 1.
  const activeItem = state.cartItems.find((item) => item.id === state.activeCartItemId);
  const linkedIds = activeItem?.assignedParticipantIds ?? [];
  // New (local) people are sent as explicit new participants; the server creates them for the
  // payer inside the booking transaction (no early writes, no duplicates on retry).
  const { linked: linkedParticipants } = resolveLinkedParticipants(state);
  const savesParticipants = state.productType === "private" || state.productType === "group";
  const { foreign, isLoading: ownershipLoading } = useParticipantOwnership(savesParticipants ? linkedIds : [], state.customerId);
  const missingBirth = linkedParticipants.filter((p) => (p.isGuest || p.id.startsWith("guest-")) && !p.birth_date);
  const participantIssue: string | null = !savesParticipants || state.isEditMode
    ? null
    : linkedParticipants.length !== linkedIds.length
      ? "Ein zugewiesener Teilnehmer ist nicht mehr vorhanden. Bitte in Schritt 1 Teilnehmer neu zuweisen."
      : foreign.length > 0
        ? `${foreign.map((f) => f.name).join(", ")} gehör${foreign.length === 1 ? "t" : "en"} zu einem anderen Kunden. Bitte im Kunden-Schritt den passenden Kunden wählen oder die Teilnehmer neu zuweisen.`
        : missingBirth.length > 0
          ? `Geburtsdatum fehlt für ${missingBirth.map((p) => p.first_name).join(", ")}. Bitte in Schritt 1 ergänzen.`
          : null;
  const participantsUnresolved = !!participantIssue || ownershipLoading;
  const [submitError, setSubmitError] = useState<{ message: string; unknown: boolean } | null>(null);
  // The create path saves the active lesson only; never drop further cart items silently.
  // B07b: several positions are saved together only via the atomic office-booking path (switch-gated).
  const multiCart = !state.isEditMode && state.cartItems.length > 1 && officeMultiItemLive();
  const multiItemBlocked = !state.isEditMode && state.cartItems.length > 1 && !multiCart;
  const [officeReady, setOfficeReady] = useState<{ ready: OfficeCartReady | null; busy: boolean }>({ ready: null, busy: false });
  // B07b attempt lifecycle: an unresolved (unknown-outcome) office create blocks every other submit
  // until the frozen original is replayed under its key and settles (success or definite rejection).
  const [pendingAttempt, setPendingAttempt] = useState<PendingOfficeAttempt | null>(() => readPendingOfficeAttempt());
  const [recovered, setRecovered] = useState<{ ok: boolean; text: string; ticketId?: string } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const attemptBlocked = !state.isEditMode && !!pendingAttempt;
  const handleOfficeReady = useCallback((ready: OfficeCartReady | null, busy: boolean) => setOfficeReady({ ready, busy }), []);

  // B07-P2 (switch OFF until release): the summary shows the server quote and the create binds to it.
  const serverQuoteActive = !multiCart && usesServerPrivatePath && privateTariffsLive();
  const quoteOverride = useMemo(() => discountOverrideFor({ discountExplicit, discountPercent, discountReason }),
    // reason does not change the price; only percent/explicitness requote
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [discountExplicit, discountPercent]);
  const quoteSlots = useMemo<{ slots: PaSlot[] | null; error: string | null }>(() => {
    if (!serverQuoteActive) return { slots: null, error: null };
    try { return { slots: buildServerPrivateSlots(state), error: null }; }
    catch (e) { return { slots: null, error: e instanceof Error ? e.message : "Termine unvollständig." }; }
  }, [serverQuoteActive, state]);
  const queryClient = useQueryClient();
  const [shownQuote, setShownQuote] = useState<{ quote: CreateQuote | null; busy: boolean }>({ quote: null, busy: false });
  const handleQuote = useCallback((quote: CreateQuote | null, busy: boolean) => setShownQuote({ quote, busy }), []);
  const quoteBlocked = serverQuoteActive && (!shownQuote.quote || shownQuote.busy);

  const handleReplayAttempt = async () => {
    const p = readPendingOfficeAttempt();
    if (!p || replaying) return;
    setReplaying(true);
    try {
      const created = await officeCreate(p.key, p.cart, p.quoteDigest, p.confirmationRequested);
      settleOfficeAttempt("success");
      setPendingAttempt(null);
      setSubmitError(null);
      setRecovered({ ok: true, ticketId: created.ticket_id,
        text: `Die ursprüngliche Anfrage ist gespeichert: Buchung ${created.ticket_number} (CHF ${Number(created.total).toFixed(2)}). Ihre aktuellen Eingaben bleiben erhalten; ein erneutes Speichern erstellt eine zusätzliche Buchung.` });
      void bookingConfirmation(created.ticket_id, "process");
      void queryClient.invalidateQueries({ queryKey: ["office-cart-quote"] });
    } catch (e) {
      const unknown = !(e instanceof OfficeBookingError) || e.unknown;
      if (unknown) {
        setRecovered({ ok: false, text: "Ergebnis weiterhin unbekannt. Bitte später erneut prüfen; es wird keine doppelte Buchung erzeugt." });
      } else {
        settleOfficeAttempt("rejected");
        setPendingAttempt(null);
        setRecovered({ ok: true, text: `Die ursprüngliche Anfrage wurde nicht gespeichert (${(e as Error).message}) Sie können die aktuellen Angaben jetzt speichern.` });
      }
    } finally { setReplaying(false); }
  };

  const handleCreateBooking = async () => {
    if (submitLock.current || showSuccess) return;
    if (attemptBlocked) {
      toast.error("Eine frühere Speicherung hat ein unbekanntes Ergebnis. Bitte zuerst die ursprüngliche Anfrage prüfen.");
      return;
    }
    if (!state.isEditMode && multiItemBlocked) {
      toast.error("Mehrere Unterrichte können noch nicht gemeinsam gespeichert werden.");
      return;
    }
    if (!state.isEditMode && participantsUnresolved) {
      toast.error(participantIssue ?? "Teilnehmer werden geprüft …");
      return;
    }
    setSubmitError(null);

    if (!state.isEditMode && !paymentMethod) {
      toast.error("Bitte wähle eine Zahlungsart");
      return;
    }

    if (!state.isEditMode && paymentMethod === "hotel" && !billingPartnerId) {
      toast.error("Bitte wähle das Hotel, das die Rechnung übernimmt");
      return;
    }


    if (multiCart && (!officeReady.ready || officeReady.busy)) {
      toast.error("Der Gesamtpreis wird noch berechnet oder ist nicht verfügbar.");
      return;
    }
    if (quoteBlocked) {
      toast.error("Der Serverpreis wird noch berechnet oder ist nicht verfügbar.");
      return;
    }
    if ((discountPercent > 0 || ((serverQuoteActive || multiCart) && discountExplicit)) && !discountReason.trim()) {
      toast.error("Bitte gib einen Grund für den Rabatt an");
      return;
    }

    // Combine manual + auto discount
    const totalDiscount = discountPercent + autoDiscountPercent;
    const combinedReason = [
      autoDiscountReason,
      discountReason,
    ].filter(Boolean).join(", ");

    submitLock.current = true;
    try {
      if (state.isEditMode && state.canonicalEdit) {
        // Canonical private bookings must never reach the legacy direct item writes.
        throw new Error("Privatlektionen werden über die Termin-Bearbeitung gespeichert. Es wurde nichts geändert.");
      }
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
      } else if (multiCart && officeReady.ready) {
        // B07b: the whole cart in ONE server transaction, bound to exactly the quote shown above.
        const { cart, key, quote } = officeReady.ready;
        const frozen = beginOfficeAttempt({ key, cart, quoteDigest: quote.quote_digest, confirmationRequested: sendCustomerEmail,
          total: Number(quote.total), positions: cart.items.length });
        let created;
        try { created = await officeCreate(frozen.key, frozen.cart, frozen.quoteDigest, frozen.confirmationRequested); }
        catch (e) {
          const unknown = !(e instanceof OfficeBookingError) || e.unknown;
          settleOfficeAttempt(unknown ? "unknown" : "rejected");
          setPendingAttempt(readPendingOfficeAttempt());
          throw e;
        }
        settleOfficeAttempt("success");
        setPendingAttempt(null);
        try { sessionStorage.removeItem("yeti.scheduler.planningDraft.v1"); } catch { /* ignore */ }
        setCreatedTicket({ id: created.ticket_id, number: created.ticket_number });
        setShowSuccess(true);
        setConfirmation({ success: false, outcome: "pending" });
        void bookingConfirmation(created.ticket_id, "process").then(setConfirmation);
      } else {
        // CREATE MODE: Use createBooking hook
        const result = await createBooking.mutateAsync({
          ...state,
          ...((state.productType === "private" || state.productType === "group") ? { selectedParticipants: linkedParticipants } : {}),
          paymentMethod,
          settlement,
          billingPartnerId,
          paymentDueDate: checkoutPaymentDueDate(state),
          discountPercent: totalDiscount,
          discountReason: combinedReason,
          ...(serverQuoteActive && shownQuote.quote ? { privateQuoteShown: {
            revision: shownQuote.quote.revision, discountRuleRevision: shownQuote.quote.discount_rule_revision, total: Number(shownQuote.quote.total),
            dayContextDigest: shownQuote.quote.day_context_digest,
          } } : {}),
          ...checkoutSubmitFlags(state),
        });


        setCreatedTicket({ id: result.ticketId, number: result.ticketNumber });
        setShowSuccess(true);
        setConfirmation({ success: false, outcome: result.confirmationAction ? "pending" : "not_requested" });
        // Saved ticket is visible before sending. All post-commit delivery failures
        // remain mail outcomes, never enter the booking-create error path.
        if (result.confirmationAction) {
          void bookingConfirmation(result.ticketId, result.confirmationAction).then(setConfirmation);
        }
      }
    } catch (error) {
      console.error("Failed to save booking:", error);
      // B07-P3: price basis changed (tariff, rule or same-day lessons) => fetch a fresh quote; the office
      // must look at the new price and submit again. Nothing was saved.
      if (error instanceof OfficeBookingError && error.code === "quote_changed") {
        // Stale combined quote: drop the acknowledged one, show the fresh price, require a new click.
        setOfficeReady({ ready: null, busy: true });
        void queryClient.invalidateQueries({ queryKey: ["office-cart-quote"] });
      }
      if (error instanceof PrivateAppointmentError && error.code === "quote_changed") {
        void queryClient.invalidateQueries({ queryKey: ["pa-create-quote"] });
      }
      // Show the service's own safe domain message (incl. "Ergebnis unbekannt"); entered data stays.
      const message = error instanceof Error && error.message && !/^(Failed to fetch|NetworkError|TypeError)/i.test(error.message)
        ? error.message
        : null;
      const unknown = error instanceof OfficeBookingError ? error.unknown
        : !!(error && typeof error === "object" && "unknown" in error && (error as { unknown?: boolean }).unknown);
      const fallback = state.isEditMode ? "Fehler beim Speichern" : "Fehler beim Erstellen der Buchung";
      setSubmitError({ message: message ?? `${fallback}. Ihre Eingaben bleiben erhalten.`, unknown });
      toast.error(message ?? fallback, { duration: 10000 });
    } finally { submitLock.current = false; }
  };

  const handleNewBooking = () => {
    setShowSuccess(false);
    resetWizard();
  };

  const firstCourseDate = checkoutFirstCourseDate(state);

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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        {/* Summary Cards: first on mobile, sticky alongside the controls on desktop */}
        <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <h3 className="mb-3 text-sm font-semibold">Zusammenfassung</h3>
          <BookingSummaryCards onEditStep={onEditStep} />
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          <Separator />

          {/* Price: server quote on the released product-tariff path, legacy breakdown otherwise */}
          {multiCart ? (
            <OfficeCartQuote state={state} onReady={handleOfficeReady} />
          ) : serverQuoteActive ? (
            <PrivateServerQuote
              productId={state.productId}
              persons={linkedParticipants.length}
              customerId={state.customerId}
              knownParticipantIds={linkedParticipants.filter((p) => !p.isGuest && !p.id.startsWith("guest-")).map((p) => p.id)}
              slots={quoteSlots.slots}
              planError={quoteSlots.error}
              override={quoteOverride}
              onQuote={handleQuote}
            />
          ) : (
            <PriceBreakdown
              discountPercent={discountPercent}
              autoDiscountPercent={autoDiscountPercent}
              autoDiscountReason={autoDiscountReason}
            />
          )}

          {/* Manual discount — on the private server path the server applies it to every appointment line */}
          <DiscountSection
            discountPercent={discountPercent}
            discountReason={discountReason}
            discountExplicit={serverQuoteActive || multiCart ? discountExplicit : false}
            overrideNote={serverQuoteActive || multiCart ? "Ersetzt den automatischen Tagesrabatt für diese Lektionen (wird nicht addiert)." : undefined}
            onDiscountChange={handleDiscountChange}
          />

          <Separator />

          {/* Payment */}
          <PaymentMethodSelection
            paymentMethod={paymentMethod}
            settlement={settlement}
            billingPartnerId={billingPartnerId}
            paymentDueDate={checkoutPaymentDueDate(state)}
            onPaymentMethodChange={setPaymentMethod}
            onSettlementChange={setSettlement}
            onBillingPartnerChange={setBillingPartnerId}
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
        </div>
      </div>

      {!state.isEditMode && (multiItemBlocked || participantsUnresolved) && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
          {multiItemBlocked
            ? "Im Warenkorb sind mehrere Unterrichte. Sie können noch nicht gemeinsam gespeichert werden – bitte je Unterricht eine Buchung erstellen."
            : participantIssue ?? "Teilnehmer werden geprüft …"}
        </p>
      )}
      {attemptBlocked && pendingAttempt && (
        <div role="alert" data-testid="pending-attempt" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
          <p>
            Eine frühere Speicherung ({pendingAttempt.positions} Positionen, CHF {pendingAttempt.total.toFixed(2)}) hat ein unbekanntes Ergebnis.
            Bevor geänderte Angaben gespeichert werden können, muss die ursprüngliche Anfrage geprüft werden. Sie wird unverändert erneut gesendet;
            war sie bereits gespeichert, entsteht keine zweite Buchung.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => void handleReplayAttempt()} disabled={replaying} data-testid="pending-attempt-replay">
            {replaying ? "Wird geprüft …" : "Ursprüngliche Anfrage prüfen"}
          </Button>
        </div>
      )}
      {recovered && (
        <p role="status" data-testid="pending-attempt-result" className="rounded-md border px-3 py-2 text-sm">
          {recovered.text}
          {recovered.ticketId && <> <a className="underline" href={`/bookings/${recovered.ticketId}`}>Buchung öffnen</a></>}
        </p>
      )}
      {submitError && (
        <p role="alert" data-testid="submit-error" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">
          {submitError.message}
          {submitError.unknown ? "" : " Ihre Eingaben bleiben erhalten."}
        </p>
      )}

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
            disabled={createBooking.isPending || updateBooking.isPending || (!state.isEditMode && (attemptBlocked || multiItemBlocked || participantsUnresolved || quoteBlocked || (multiCart && (!officeReady.ready || officeReady.busy))))}
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
          customerEmail={sendCustomerEmail ? customerEmailRecipient(state.customer) : null}
          confirmation={confirmation}
          instructorName={
            notifyInstructor && teacherNames.length > 0 ? teacherNames.join(", ") : null
          }
          onClose={() => setShowSuccess(false)}
          onNewBooking={handleNewBooking}
        />
      )}
    </div>
  );
}
