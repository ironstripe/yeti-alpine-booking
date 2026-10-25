// B07b: pure mapping of the WHOLE wizard cart (incl. the active, not yet stashed item) to one
// `office-booking` request. No prices are computed here; the server quote is authoritative.
// Fails closed: any position that cannot be represented exactly returns a German error.
import {
  applyCartItemToState, extractCartItemFromState,
  type BookingWizardState, type CartItem, type SelectedParticipant,
} from "@/contexts/BookingWizardContext";
import { participantPool } from "@/lib/linkedParticipants";
import { buildServerPrivateSlots, discountOverrideFor } from "@/lib/serverPrivateSlots";
import { buildStaffGroupLines, type LunchLookup } from "@/lib/staffGroupPayload";
import type { StaffFinalization } from "@/lib/privateAppointmentsApi";

export type OfficeParticipant =
  | { ref: string; participant_id: string }
  | { ref: string; guest: { first_name: string; last_name?: string; birth_date: string; sport?: "ski" | "snowboard"; level?: string } };
export interface OfficeSlot {
  date: string; time_start: string; time_end: string; meeting_point?: string;
  instructor_id?: string; assign_later?: true; participants?: string[];
}
export interface OfficePrivateItem {
  kind: "private"; product_id: string; participants: string[]; appointments: OfficeSlot[];
  discount_override?: { percent: number; reason?: string };
}
export interface OfficeGroupLine {
  participant: string; course_id: string; product_id: string; dates: string[]; block?: "am" | "pm" | null;
  sport?: "ski" | "snowboard"; meeting_point?: string | null; lunch_dates?: string[]; vegetarian?: boolean;
  lunch_product_id?: string; expected_unit_price?: number; expected_lunch_unit_price?: number;
}
export interface OfficeGroupItem { kind: "group"; lines: OfficeGroupLine[] }
export interface OfficeCart {
  customer_id: string; notes?: string;
  participants: OfficeParticipant[];
  items: Array<OfficePrivateItem | OfficeGroupItem>;
  group_discount?: { percent: number; reason?: string };
  finalization?: StaffFinalization;
}
export type OfficeCartResult =
  | { kind: "ready"; cart: OfficeCart; refs: Record<string, string>; itemIds: string[] }
  | { kind: "error"; message: string; item?: string };

const isGuest = (p: SelectedParticipant) => !!p.isGuest || p.id.startsWith("guest-") || p.id.startsWith("local-");

/** The actual cart: stored items, with the active item taken from the live wizard fields. */
export function currentCartItems(state: BookingWizardState): CartItem[] {
  return state.cartItems.map((it) => (it.id === state.activeCartItemId ? extractCartItemFromState(state, it.id) : it));
}

/** Wizard state as if `item` were the only, active item (same projection the single-item paths use). */
export function itemState(state: BookingWizardState, item: CartItem): BookingWizardState {
  return { ...state, ...applyCartItemToState(item), cartItems: [item], activeCartItemId: item.id };
}

export function buildOfficeCart(
  state: BookingWizardState, lunch: LunchLookup, finalization?: StaffFinalization,
): OfficeCartResult {
  if (!state.customerId) return { kind: "error", message: "Bitte zahlungspflichtigen Kunden wählen." };
  const items = currentCartItems(state);
  if (items.length === 0) return { kind: "error", message: "Der Warenkorb ist leer." };

  // One stable ref per person for the whole cart (first appearance order).
  const refs: Record<string, string> = {};
  const participants: OfficeParticipant[] = [];
  const pool = participantPool({ selectedParticipants: state.selectedParticipants, localParticipants: state.localParticipants ?? [] });
  const refFor = (id: string): string | { error: string } => {
    if (refs[id]) return refs[id];
    const p = pool.find((x) => x.id === id);
    if (!p) return { error: "Ein zugewiesener Teilnehmer ist nicht mehr vorhanden. Bitte Teilnehmer neu zuweisen." };
    const ref = `p${participants.length + 1}`;
    if (isGuest(p)) {
      if (!p.birth_date) return { error: `Geburtsdatum für ${p.first_name} fehlt.` };
      participants.push({ ref, guest: {
        first_name: p.first_name, ...(p.last_name ? { last_name: p.last_name } : {}), birth_date: p.birth_date,
        ...(p.sport === "ski" || p.sport === "snowboard" ? { sport: p.sport } : {}),
        ...(p.level_current_season ? { level: p.level_current_season } : {}),
      } });
    } else participants.push({ ref, participant_id: p.id });
    refs[id] = ref;
    return ref;
  };

  const override = discountOverrideFor(state);
  if (override && !override.reason) return { kind: "error", message: "Bitte gib einen Grund für den manuellen Rabatt an." };
  const out: OfficeCart["items"] = [];
  let hasGroup = false;

  for (const [n, item] of items.entries()) {
    const label = `Position ${n + 1}`;
    const ids = [...new Set(item.assignedParticipantIds ?? [])];
    if (ids.length === 0) return { kind: "error", item: item.id, message: `${label}: keine Teilnehmer zugewiesen.` };
    const st = itemState(state, item);
    if (item.productType === "private") {
      if (!item.productId) return { kind: "error", item: item.id, message: `${label}: bitte ein Privatunterricht-Produkt wählen.` };
      if (item.useParticipantSpecificBooking && Object.keys(item.participantBookings ?? {}).length > 0)
        return { kind: "error", item: item.id, message: `${label}: teilnehmerspezifische Privatlektionen können noch nicht gemeinsam gespeichert werden.` };
      if (item.privateGroupProposal && item.privateGroupProposal.groups.length > 1)
        return { kind: "error", item: item.id, message: `${label}: aufgeteilte Privatgruppen bitte als eigene Positionen anlegen.` };
      if (item.includeLunch) return { kind: "error", item: item.id, message: `${label}: Mittagessen kann bei Privatunterricht nicht mitgebucht werden.` };
      let slots;
      try { slots = buildServerPrivateSlots(st); } catch (e) { return { kind: "error", item: item.id, message: `${label}: ${(e as Error).message}` }; }
      const people: string[] = [];
      for (const id of ids) { const r = refFor(id); if (typeof r !== "string") return { kind: "error", item: item.id, message: `${label}: ${r.error}` }; people.push(r); }
      if (people.length > 4) return { kind: "error", item: item.id, message: `${label}: höchstens 4 Personen pro Privatlektion.` };
      out.push({
        kind: "private", product_id: item.productId, participants: people,
        appointments: slots.map((s) => ({ ...s })),
        ...(override ? { discount_override: override } : {}),
      });
    } else if (item.productType === "group") {
      const g = buildStaffGroupLines(st, lunch);
      if (g.kind === "error") return { kind: "error", item: item.id, message: `${label}: ${g.message}` };
      if (g.kind === "none") return { kind: "error", item: item.id, message: `${label}: nur Winter-26/27-Gruppenkurse können gemeinsam gespeichert werden.` };
      const lines: OfficeGroupLine[] = [];
      for (const l of g.lines) {
        const pid = l.participant_id ?? l.guest?.guest_key;
        const r = pid ? refFor(pid) : { error: "Teilnehmer fehlt." };
        if (typeof r !== "string") return { kind: "error", item: item.id, message: `${label}: ${r.error}` };
        const { participant_id: _p, guest: _g, ...rest } = l;
        lines.push({ participant: r, ...rest });
      }
      out.push({ kind: "group", lines });
      hasGroup = true;
    } else {
      return { kind: "error", item: item.id, message: `${label}: bitte Produktart wählen.` };
    }
  }

  return {
    kind: "ready",
    refs,
    itemIds: items.map((i) => i.id),
    cart: {
      customer_id: state.customerId,
      ...(state.customerNotes ? { notes: state.customerNotes } : {}),
      participants, items: out,
      ...(hasGroup && override && override.percent > 0 ? { group_discount: override } : {}),
      ...(finalization ? { finalization } : {}),
    },
  };
}

// Attempt lifecycle (per browser tab, survives remount/navigation): ONE draft key for the wizard
// session, independent of item ids/order. Before create, the exact request is frozen as the pending
// attempt (write-ahead). Only a confirmed success or a definite rejection settles it; while an
// outcome is unknown no other submission (changed cart, single-item path) is allowed, only the
// explicit replay of the frozen original under its original key.
const DRAFT_KEY = "yeti.office.submit.draft";
const PENDING_KEY = "yeti.office.submit.pending";
type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (): KV => sessionStorage;

export interface PendingOfficeAttempt {
  key: string; cart: OfficeCart; quoteDigest: string; confirmationRequested: boolean;
  total: number; positions: number; startedAt: string;
}

export function readPendingOfficeAttempt(storage: KV = store()): PendingOfficeAttempt | null {
  try { const v = storage.getItem(PENDING_KEY); return v ? (JSON.parse(v) as PendingOfficeAttempt) : null; } catch { return null; }
}

export function officeSubmissionKey(storage: KV = store()): string {
  const pending = readPendingOfficeAttempt(storage);
  if (pending) return pending.key;
  let v = storage.getItem(DRAFT_KEY);
  if (!v) { v = crypto.randomUUID(); storage.setItem(DRAFT_KEY, v); }
  return v;
}

/** Freeze the exact request before sending. Refuses to replace a different unresolved attempt. */
export function beginOfficeAttempt(a: Omit<PendingOfficeAttempt, "startedAt">, storage: KV = store()): PendingOfficeAttempt {
  const prev = readPendingOfficeAttempt(storage);
  if (prev) {
    if (prev.key !== a.key || JSON.stringify(prev.cart) !== JSON.stringify(a.cart) || prev.quoteDigest !== a.quoteDigest
      || prev.confirmationRequested !== a.confirmationRequested) throw new Error("pending_attempt");
    return prev;
  }
  const rec = { ...a, startedAt: new Date().toISOString() };
  storage.setItem(PENDING_KEY, JSON.stringify(rec));
  return rec;
}

/** success: the key is consumed -> next booking gets a fresh key. rejected: nothing was saved under the
 *  key (server rolls back), the draft key stays. unknown: keep the frozen attempt. */
export function settleOfficeAttempt(outcome: "success" | "rejected" | "unknown", storage: KV = store()) {
  if (outcome === "unknown") return;
  storage.removeItem(PENDING_KEY);
  if (outcome === "success") storage.removeItem(DRAFT_KEY);
}
