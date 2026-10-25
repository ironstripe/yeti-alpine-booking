// B07-P: input contract for product-configured private tariff rules (save endpoint).
// The SQL save function re-validates everything; this only rejects malformed requests early.
import { z } from "https://esm.sh/zod@3.23.8";

const time = z.string().regex(/^\d{2}:\d{2}$/);

export const RuleSchema = z.object({
  rule_kind: z.enum(["exact_block", "hourly"]),
  window_start: time,
  window_end: time,
  price_chf: z.number().positive().max(100000),
  extra_person_chf: z.number().min(0).max(100000),
  max_persons: z.number().int().min(1).max(5),
  max_block_minutes: z.number().int().min(60).multipleOf(60).nullable().optional(),
  office_only: z.boolean().optional(),
  provenance: z.string().trim().min(1).max(500),
}).strict();

export const SaveRulesBodySchema = z.object({
  product_id: z.string().uuid(),
  expected_revision: z.number().int().min(0),
  rules: z.array(RuleSchema).max(48),
}).strict();
