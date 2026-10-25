// Input schema + status mapping for the staff `office-booking` endpoint (B07a atomic multi-item cart).
// The SQL function b07a_office_multi is the authority; this only rejects malformed input early.
import { z } from "https://esm.sh/zod@3.23.8";
import { birthDateIssue } from "./birthDate.ts";
import { Finalization } from "./privateAppointmentsContract.ts";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const md5 = z.string().regex(/^[0-9a-f]{32}$/);
const ref = z.string().min(1).max(64);

const Participant = z.union([
  z.object({ ref, participant_id: uuid }).strict(),
  z.object({
    ref,
    guest: z.object({
      first_name: z.string().trim().min(1).max(100),
      last_name: z.string().trim().max(100).optional(),
      birth_date: date.refine((v) => birthDateIssue(v) === null, "birth_date"),
      sport: z.enum(["ski", "snowboard"]).optional(),
      level: z.string().trim().min(1).max(40).nullable().optional(),
    }).strict(),
  }).strict(),
]);

const slotBase = { date, time_start: time, time_end: time, meeting_point: z.string().max(200).optional(),
  participants: z.array(ref).min(1).max(4).optional() };
const Slot = z.union([
  z.object({ ...slotBase, instructor_id: uuid, assign_later: z.undefined() }).strict(),
  z.object({ ...slotBase, assign_later: z.literal(true), instructor_id: z.undefined() }).strict(),
]);
const DiscountOverride = z.object({ percent: z.number().finite().min(0).max(100), reason: z.string().trim().max(500).optional() }).strict();

const PrivateItem = z.object({
  kind: z.literal("private"),
  product_id: uuid,
  participants: z.array(ref).min(1).max(4),
  appointments: z.array(Slot).min(1).max(60),
  discount_override: DiscountOverride.optional(),
}).strict();
const GroupLine = z.object({
  participant: ref,
  course_id: uuid,
  product_id: uuid,
  dates: z.array(date).min(1).max(10),
  block: z.enum(["am", "pm"]).nullable().optional(),
  sport: z.enum(["ski", "snowboard"]).optional(),
  meeting_point: z.string().max(200).nullable().optional(),
  lunch_dates: z.array(date).max(10).optional(),
  vegetarian: z.boolean().optional(),
  lunch_product_id: uuid.optional(),
  expected_unit_price: z.number().finite().optional(),
  expected_lunch_unit_price: z.number().finite().optional(),
}).strict();
const GroupItem = z.object({ kind: z.literal("group"), lines: z.array(GroupLine).min(1).max(30) }).strict();

const Cart = {
  submission_key: z.string().min(8).max(100),
  customer_id: uuid,
  notes: z.string().max(2000).optional(),
  participants: z.array(Participant).min(1).max(30),
  items: z.array(z.discriminatedUnion("kind", [PrivateItem, GroupItem])).min(1).max(20),
  group_discount: z.object({ percent: z.number().finite().min(0).max(100), reason: z.string().trim().max(500).optional() }).strict().optional(),
  finalization: Finalization.optional(),
};

export const OfficeBookingRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), ...Cart }).strict(),
  z.object({ action: z.literal("create"), ...Cart, confirmation_requested: z.boolean(), acknowledged_quote_digest: md5 }).strict(),
]);
export type OfficeBookingRequest = z.infer<typeof OfficeBookingRequest>;

export function officeStatusFor(result: Record<string, unknown>): number {
  if (result.ok === true) return 200;
  switch (result.error) {
    case "conflict": case "quote_changed": case "submission_mismatch": case "tariff_transition_required": return 409;
    case "tariff_unavailable": return 422;
    case "not_found": return 404;
    case "forbidden": return 403;
    case "invalid": return 400;
    default: return 500;
  }
}

/** Only whitelisted keys leave the server. */
export function officePublicBody(result: Record<string, unknown>): Record<string, unknown> {
  const status = officeStatusFor(result);
  if (status === 200) { const { ok: _ok, ...rest } = result; return rest; }
  const pos = { item: result.item ?? null, index: result.index ?? null };
  if (result.error === "quote_changed") return { error: "quote_changed", quote: result.quote ?? null, ...pos };
  if (result.error === "submission_mismatch") return { error: "submission_mismatch" };
  if (result.error === "tariff_transition_required") return { error: "tariff_transition_required" };
  if (status === 422) return { error: "tariff_unavailable", reason: result.reason ?? null, ...pos };
  if (status === 409) return { error: "conflict", conflicts: result.conflicts ?? [] };
  if (status === 404) return { error: "not_found", field: result.field ?? null };
  if (status === 403) return { error: "forbidden" };
  if (status === 400) return { error: "invalid", field: result.field ?? null, ref: result.ref ?? null, ...pos };
  return { error: "internal_error" };
}
