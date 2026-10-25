// Resolve the people linked to the active cart item for saving: existing participants as-is,
// still-local new people (draft, never written early) as explicit new participants that the server
// creates for the payer inside the booking transaction. IDs stay unchanged so per-person course,
// lunch and vegetarian data keyed by those IDs remain attached.
import type { BookingWizardState, SelectedParticipant } from "@/contexts/BookingWizardContext";

/** Saved participants plus people newly entered in step 1 (local, created by the server on save). */
export function participantPool(state: Pick<BookingWizardState, "selectedParticipants" | "localParticipants">): SelectedParticipant[] {
  const localAsGuests: SelectedParticipant[] = state.localParticipants.map((lp) => ({
    id: lp.id,
    first_name: lp.first_name,
    last_name: lp.last_name ?? null,
    birth_date: lp.birth_date ?? "",
    level_last_season: null,
    level_current_season: lp.skill_level ?? null,
    sport: lp.sport,
    isGuest: true,
  }) as SelectedParticipant);
  return [...state.selectedParticipants, ...localAsGuests];
}

export function resolveLinkedParticipants(state: Pick<BookingWizardState, "cartItems" | "activeCartItemId" | "selectedParticipants" | "localParticipants">) {
  const linkedIds = state.cartItems.find((item) => item.id === state.activeCartItemId)?.assignedParticipantIds ?? [];
  const pool = participantPool(state);
  const linked = linkedIds.map((id) => pool.find((p) => p.id === id)).filter((p): p is SelectedParticipant => !!p);
  return { linkedIds, linked, unresolved: linked.length !== linkedIds.length };
}
