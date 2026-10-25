// R1 (S2 step-1 price): once product tariffs are live, the step-1 preview of an ordinary private lesson uses
// the same server quote as the summary (product tariff + configured same-day rule). No legacy hourly rate,
// no client money math; incomplete input or a server problem shows loading/unavailable instead of a price.
import { useCallback, useMemo } from "react";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { buildServerPrivateSlots } from "@/lib/serverPrivateSlots";
import { participantPool } from "@/lib/linkedParticipants";
import type { PaSlot } from "@/lib/privateAppointmentsApi";
import { PrivateServerQuote } from "./PrivateServerQuote";

export function StepOnePrivateServerQuote() {
  const { state } = useBookingWizard();
  const active = state.cartItems.find((i) => i.id === state.activeCartItemId);
  const ids = active?.assignedParticipantIds ?? [];
  const pool = participantPool(state);
  const linked = ids.map((id) => pool.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const known = linked.filter((p) => !p.isGuest && !p.id.startsWith("guest-") && !p.id.startsWith("local-")).map((p) => p.id);
  const plan = useMemo<{ slots: PaSlot[] | null; error: string | null }>(() => {
    try { return { slots: buildServerPrivateSlots(state), error: null }; }
    catch (e) { return { slots: null, error: e instanceof Error ? e.message : "Termine unvollständig." }; }
  }, [state]);
  const noop = useCallback(() => {}, []);
  if (linked.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="step1-private-price-pending">Preis folgt, sobald Personen zugewiesen sind.</p>;
  }
  return (
    <PrivateServerQuote productId={state.productId} persons={linked.length} customerId={state.customerId}
      knownParticipantIds={known} slots={plan.slots} planError={plan.error} override={undefined} onQuote={noop} />
  );
}
