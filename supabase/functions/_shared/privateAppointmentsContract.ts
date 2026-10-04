// Input schema + status mapping for the `private-appointments` staff endpoint.
import { z } from "https://esm.sh/zod@3.23.8";

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
    birth_date: date,
    sport: z.enum(["ski", "snowboard"]).optional(),
  }).strict(),
]);

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
  }),
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
]).superRefine((v, ctx) => {
  // A non-zero manual discount always needs a reason.
  if (v.action === "create" && (v.discount_percent ?? 0) > 0 && !v.discount_reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discount_reason"], message: "required when discount_percent > 0" });
  }
});
export type PaRequest = z.infer<typeof RequestSchema>;

/** Maps a DB function result ({ok} or {error}) to an HTTP status. */
export function statusFor(result: Record<string, unknown>): number {
  if (result.ok === true) return 200;
  switch (result.error) {
    case "conflict": return 409;
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
  if (status === 409) return { error: "conflict", conflicts: result.conflicts };
  if (status === 423) return { error: "protected", excluded: result.excluded };
  if (status === 404) return { error: "not_found" };
  if (status === 403) return { error: "forbidden" };
  if (status === 400) return { error: "invalid", field: result.field ?? null, index: result.index ?? null };
  return { error: "internal_error" };
}
