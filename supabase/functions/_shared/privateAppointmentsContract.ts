// Input schema + status mapping for the `private-appointments` staff endpoint.
import { z } from "https://esm.sh/zod@3.23.8";
import { birthDateIssue } from "./birthDate.ts";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

const meeting_point = z.string().max(200).optional();
// A slot either names a real teacher, or carries the explicit "Später zuweisen" intent
// (assign_later: true, no instructor_id). A merely missing teacher matches neither.
const assignedSlot = z.object({ date, time_start: time, time_end: time, instructor_id: uuid, meeting_point, assign_later: z.undefined() });
const laterSlot = z.object({ date, time_start: time, time_end: time, assign_later: z.literal(true), instructor_id: z.undefined(), meeting_point });
const slot = z.union([assignedSlot, laterSlot]);
const participant = z.union([
  z.object({ participant_id: uuid }).strict(),
  z.object({
    guest_key: z.string().min(8).max(100),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().max(100).optional(),
    // B08: real calendar date, not after the school date (Europe/Zurich).
    birth_date: date.refine((v) => birthDateIssue(v) === null, "birth_date"),
    sport: z.enum(["ski", "snowboard"]).optional(),
    // Draft participant's chosen level; validated per sport by SQL staff_guest_level_ok (migration 0007).
    level: z.string().trim().min(1).max(40).optional(),
  }).strict(),
]);

// Office settlement/notes, applied in the same DB transaction as the booking (migration 0006).
// actor_name/actor_email are always set by the server from the verified caller.
export const Finalization = z.object({
  payment_method: z.enum(["cash", "card", "twint", "voucher", "invoice", "hotel"]).nullable().optional(),
  settlement: z.enum(["paid_now", "pay_later"]).optional(),
  billing_partner_id: uuid.nullable().optional(),
  payment_due_date: date.nullable().optional(),
  internal_notes: z.string().max(5000).optional(),
  instructor_notes: z.string().max(5000).optional(),
  conversation_id: uuid.nullable().optional(),
}).strict();

const DiscountOverride = z.object({
  percent: z.number().finite().min(0).max(100),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const RequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    submission_key: z.string().min(8).max(100),
    customer_id: uuid,
    product_id: uuid,
    notes: z.string().max(2000).optional(),
    appointments: z.array(slot).min(1).max(60),
    participants: z.array(participant).min(1).max(4),
    discount_percent: z.number().finite().min(0).max(100).optional(),
    discount_reason: z.string().trim().max(500).optional(),
    finalization: Finalization.optional(),
    confirmation_requested: z.boolean().optional(),
    // B07-P: tariff revision shown in the preview; required once product tariffs are installed.
    quote_revision: z.number().int().min(0).optional(),
    // B07-P2: discount-rule revision shown in the preview, and an explicit manual override that
    // REPLACES the automatic same-day discount (never added). Absent => automatic.
    discount_rule_revision: z.number().int().min(0).optional(),
    discount_override: DiscountOverride.optional(),
  }),
  // B07-P: server preview of a new office private booking (same resolver as create).
  z.object({
    action: z.literal("quote"),
    product_id: uuid,
    persons: z.number().int().min(1).max(4),
    appointments: z.array(z.object({ date, time_start: time, time_end: time })).min(1).max(60),
    discount_override: DiscountOverride.optional(),
  }).strict(),
  z.object({
    action: z.literal("move"),
    appointment_id: uuid,
    date, time_start: time, time_end: time, instructor_id: uuid,
  }),
  z.object({
    action: z.literal("period_update"),
    period_group_id: uuid,
    changes: z.object({ time_start: time.optional(), time_end: time.optional(), instructor_id: uuid.optional() })
      .refine((c) => Object.keys(c).length > 0, "at least one change"),
  }),
  // B03a: edit an existing canonical private booking in one transaction (pa_edit_booking).
  z.object({
    action: z.literal("edit"),
    mode: z.enum(["quote", "apply"]),
    ticket_id: uuid,
    expected_total: z.number().finite(),
    appointments: z.array(z.object({
      appointment_id: uuid,
      expected_participant_ids: z.array(uuid).max(4),
      expected_price: z.number().finite(),
      expected: z.object({ date, time_start: time, time_end: time, instructor_id: uuid.nullable(), meeting_point: z.string().nullable(), status: z.string(),
        line: z.object({ id: uuid, quantity: z.number().nullable(), unit_price: z.number().finite(), line_total: z.number().nullable(),
          discount_percent: z.number().nullable(), discount_reason: z.string().nullable(), internal_notes: z.string().nullable(), instructor_notes: z.string().nullable() }).strict(),
      }).strict(),
      internal_notes: z.string().max(5000).optional(),
      instructor_notes: z.string().max(5000).optional(),
      participant_ids: z.array(uuid).min(1).max(4).optional(),
      meeting_point: z.string().max(200).optional(),
      acknowledged_price: z.number().finite().optional(),
    }).strict()).max(60),
    acknowledged_total: z.number().finite().optional(),
    expected_customer_notes: z.string().nullable().optional(),
    customer_notes: z.string().max(2000).optional(),
  }).strict(),
]).superRefine((v, ctx) => {
  if (v.action === "edit" && v.customer_notes !== undefined && !("expected_customer_notes" in v)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expected_customer_notes"], message: "original required" });
  }
  // A non-zero manual discount always needs a reason.
  if (v.action === "create" && (v.discount_percent ?? 0) > 0 && !v.discount_reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discount_reason"], message: "required when discount_percent > 0" });
  }
  // An explicit override (including an explicit 0) always needs a reason and excludes the legacy field.
  if (v.action === "create" && v.discount_override && (!v.discount_override.reason || (v.discount_percent ?? 0) !== 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discount_override"], message: "reason required; not combinable with discount_percent" });
  }
});
export type PaRequest = z.infer<typeof RequestSchema>;

/** Maps a DB function result ({ok} or {error}) to an HTTP status. */
export function statusFor(result: Record<string, unknown>): number {
  if (result.ok === true) return 200;
  switch (result.error) {
    case "conflict": return 409;
    case "quote_changed": return 409;
    case "tariff_transition_required": return 409;
    case "tariff_unavailable": return 422;
    case "protected": return 423;
    case "not_found": return 404;
    case "forbidden": return 403;
    case "invalid": return 400;
    default: return 500;
  }
}

/** Only whitelisted keys leave the server. */
export function publicBody(result: Record<string, unknown>): Record<string, unknown> {
  const status = statusFor(result);
  if (status === 200) { const { ok: _ok, ...rest } = result; return rest; }
  if (result.error === "quote_changed") return { error: "quote_changed", quote: result.quote };
  if (result.error === "tariff_transition_required") return { error: "tariff_transition_required" };
  if (status === 422) return { error: "tariff_unavailable", reason: result.reason ?? null, index: result.index ?? null };
  if (status === 409) return { error: "conflict", conflicts: result.conflicts };
  if (status === 423) return { error: "protected", excluded: result.excluded };
  if (status === 404) return { error: "not_found" };
  if (status === 403) return { error: "forbidden" };
  if (status === 400) return { error: "invalid", field: result.field ?? null, index: result.index ?? null };
  return { error: "internal_error" };
}
