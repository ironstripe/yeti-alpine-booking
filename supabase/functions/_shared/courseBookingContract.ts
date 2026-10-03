/**
 * Shared website API contract for 26/27 course bookings (#36), used by the
 * course-booking edge function and mirrored by the OnePager client.
 * Actions: options | reserve | complete | cancel (POST JSON, header x-api-key).
 *
 * Every response has `success: boolean`. Success responses also carry `status`
 * (string state). Error responses carry `code` (stable machine code), `message`
 * (German), and `retryable` when the SAME request may simply be repeated.
 * Fixture JSON lives in supabase/functions/course-booking/fixtures/.
 */

export const BLOCK_MORNING = "10:00-12:00" as const;
export const BLOCK_AFTERNOON = "14:00-16:00" as const;
export const BLOCK_IDS = [BLOCK_MORNING, BLOCK_AFTERNOON] as const;
export type BlockId = typeof BLOCK_IDS[number];

export const CONTRACT_VERSION = "bc-2627-website-v1";

export type ReservationState = "held" | "finalized" | "invoicing" | "confirmed" | "released";
export type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "not_configured";

export interface CourseOption {
  period_key: string;
  course_id: string;
  course_name: string;
  course_type: string;
  discipline: string;
  skill_level_id: string;
  age_min: number | null;
  age_max: number | null;
  product_id: string;
  product_name: string;
  duration_minutes: 120 | 240;
  /** Exact block IDs. 4h: both (block_mode 'all'); 2h: pick exactly one (block_mode 'choose_one'). */
  blocks: BlockId[];
  block_mode: "all" | "choose_one";
  dates: string[];
  block_dates: Record<string, string[]>;
  cancelled_dates: string[];
  lunch_included: false;
  tiers: Array<{ day_count: number; price: number; source_tariff_id: string }>;
  /** Internal teaching-group planning threshold only; never a sales cap. */
  planning_threshold: number | null;
  bookable: true;
}

export interface ReserveRequest {
  action: "reserve";
  reservation: {
    idempotency_key: string;
    participants: Array<{ ref: string; birth_date: string; discipline: "ski" | "snowboard"; skill_level: string }>;
    selections: Array<
      | { kind: "group"; participant_ref: string; period_key: string; product_id: string; dates: string[]; blocks?: BlockId[] }
      | { kind: "private"; participant_refs: string[]; product_id: string; items: Array<{ date: string; time_start: string; time_end: string }> }
    >;
    notes?: string;
  };
}

export interface CompleteRequest {
  action: "complete";
  ticket_id: string;
  reservation_token: string;
  customer: { email: string; first_name: string; last_name: string; phone?: string; street?: string; zip?: string; city?: string; country?: string };
  participants: Array<{ ref: string; first_name: string; last_name: string; birth_date: string; discipline: string; skill_level: string }>;
  notes?: string;
  payment_method?: "invoice";
}

export interface CancelRequest { action: "cancel"; ticket_id: string; reservation_token: string }

export const err = (code: string, message: string, retryable = false, extra: Record<string, unknown> = {}) =>
  ({ success: false as const, code, message, retryable, ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const isToken = (v: unknown): v is string => typeof v === "string" && v.length >= 16 && v.length <= 200;

/** HTTP status for an SQL error code (stable mapping shared with the client). */
export function httpFor(code: string | undefined): number {
  switch (code) {
    case "not_found": return 404;
    case "expired": return 410;
    case "slot_unavailable":
    case "idempotency_conflict":
    case "finalize_conflict":
    case "invalid_status":
    case "customer_ambiguous": return 409;
    default: return 400;
  }
}

/** Strict money parsing: finite, > 0, max 2 decimals. */
export function positiveAmount(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}
