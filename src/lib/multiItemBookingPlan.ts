// B07a groundwork (pure, not wired into the UI): classify a multi-item cart for a future atomic
// server create. Fails closed: every position is either supported or reported — never dropped.
// Pricing is NOT computed here; the server stays authoritative.
import type { CartItem } from "@/contexts/BookingWizardContext";

export type MultiItemIssue =
  | { code: "unknown_type"; item: string }
  | { code: "missing_product"; item: string }
  | { code: "no_participants"; item: string }
  | { code: "private_without_slots"; item: string }
  | { code: "group_without_source"; item: string }
  | { code: "participant_specific_unsupported"; item: string }
  | { code: "same_person_overlap"; participant: string; date: string; items: [string, string] }
  | { code: "discount_decision_required"; participant: string; date: string; minutes: number };

export interface MultiItemPosition { item: string; kind: "private" | "group"; productId: string; participants: string[] }
export type MultiItemPlan =
  | { kind: "supported"; positions: MultiItemPosition[]; draftParticipants: string[] }
  | { kind: "unsupported"; issues: MultiItemIssue[] };

const DRAFT = /^draft[-_:]/;
const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
/** Clock-block minutes per lesson (payroll/schedule convention, not effective teaching minutes). */
const SAME_DAY_THRESHOLD_MIN = 240;

export function classifyMultiItemCart(items: CartItem[]): MultiItemPlan {
  const issues: MultiItemIssue[] = [];
  const positions: MultiItemPosition[] = [];
  const blocks: Array<{ p: string; date: string; s: number; e: number; item: string }> = [];
  const drafts = new Set<string>();

  for (const it of items) {
    const parts = [...new Set(it.assignedParticipantIds ?? [])];
    if (it.productType !== "private" && it.productType !== "group") { issues.push({ code: "unknown_type", item: it.id }); continue; }
    if (!it.productId) issues.push({ code: "missing_product", item: it.id });
    if (parts.length === 0) issues.push({ code: "no_participants", item: it.id });
    if (it.useParticipantSpecificBooking) issues.push({ code: "participant_specific_unsupported", item: it.id });
    parts.filter((p) => DRAFT.test(p)).forEach((p) => drafts.add(p));
    if (it.productType === "private") {
      const slots = it.appointments ?? [];
      if (slots.length === 0) issues.push({ code: "private_without_slots", item: it.id });
      for (const a of slots) for (const p of parts)
        blocks.push({ p, date: a.date, s: min(a.startTime), e: min(a.endTime), item: it.id });
    } else if (!it.groupPlan?.server) {
      issues.push({ code: "group_without_source", item: it.id });
    }
    if (it.productId) positions.push({ item: it.id, kind: it.productType, productId: it.productId, participants: parts });
  }

  // Same person: overlapping private blocks conflict; adjacent (end == start) is valid.
  const byKey = new Map<string, typeof blocks>();
  for (const b of blocks) { const k = `${b.p}|${b.date}`; byKey.set(k, [...(byKey.get(k) ?? []), b]); }
  for (const [k, list] of byKey) {
    const [p, date] = k.split("|");
    const sorted = [...list].sort((a, b) => a.s - b.s);
    for (let i = 1; i < sorted.length; i++) if (sorted[i].s < sorted[i - 1].e)
      issues.push({ code: "same_person_overlap", participant: p, date, items: [sorted[i - 1].item, sorted[i].item] });
    const total = sorted.reduce((n, b) => n + (b.e - b.s), 0);
    // Confirmed 10% rule would trigger, but the canonical create has no automatic discount and the
    // allocation in shared lessons is undecided (D01) -> explicit blocker, never a guessed price.
    if (total >= SAME_DAY_THRESHOLD_MIN) issues.push({ code: "discount_decision_required", participant: p, date, minutes: total });
  }

  return issues.length ? { kind: "unsupported", issues } : { kind: "supported", positions, draftParticipants: [...drafts] };
}

/** Stable fingerprint of the whole payload for idempotency (same key + different payload => reject). */
export function canonicalPayloadString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPayloadString).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalPayloadString((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}
