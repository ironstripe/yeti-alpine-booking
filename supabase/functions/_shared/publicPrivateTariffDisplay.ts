// Public information only. Never import into booking, quote or payment code.
import { z } from 'npm:zod@3';
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const money = z.number().finite().min(0).max(100000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001);
export const publicPrivateWindowSchema = z.object({
  start: time, end: time, duration_minutes: z.union([z.literal(60), z.literal(120)]),
  amount_chf: money.refine(v => v > 0), extra_person_chf: money,
  classification: z.enum(['standard','office_exception']), window_kind: z.enum(['exact','within']),
}).strict().refine(w => {
  const minutes = (t:string) => Number(t.slice(0,2))*60+Number(t.slice(3));
  const span = minutes(w.end)-minutes(w.start);
  return span >= w.duration_minutes && (w.window_kind !== 'exact' || span === w.duration_minutes)
    && (w.window_kind !== 'within' || w.classification === 'office_exception');
});
export const publicPrivateInformationSchema = z.object({
  windows: z.array(publicPrivateWindowSchema).min(1).max(48).refine(w => new Set(w.map(v => `${v.start}/${v.end}/${v.duration_minutes}/${v.classification}`)).size === w.length),
  discount_percent: z.number().positive().max(100), discount_threshold: z.number().int().positive(),
  discount_unit: z.enum(['lessons','minutes']), discount_scope: z.literal('same_participant_same_day'),
  source_note: z.string().trim().min(1).max(240).regex(/^[^<>\r\n]+$/),
  source_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d => {const v=new Date(`${d}T00:00:00Z`);return Number.isFinite(v.getTime()) && v.toISOString().slice(0,10)===d;}),
}).strict();
export const publicPrivateSaveSchema = z.object({
  product_id:z.string().uuid(),season_id:z.string().uuid(),information:publicPrivateInformationSchema,
  expected_revision:z.number().int().positive().nullable(),verify:z.boolean(),
}).strict();
// Source notes/actors are private. Null means absent, malformed or not Office-verified.
export function publicPrivateProjection(row: unknown) {
  const envelope=z.object({verified_at:z.string().datetime({offset:true}),verified_by:z.string().uuid(),base_persons:z.literal(1)}).passthrough().safeParse(row);
  if(!envelope.success) return null;
  const data=publicPrivateInformationSchema.safeParse(Object.fromEntries(['windows','discount_percent','discount_threshold','discount_unit','discount_scope','source_note','source_date'].map(k=>[k,envelope.data[k]])));
  if(!data.success) return null;
  const info=data.data;
  return {public_private_time_tariffs:{version:1,purpose:'display_information_only',currency:'CHF',base_persons:1,windows:info.windows},
    public_private_tariff_rules:{version:1,extra_person_basis:'per_window',discount:{percent:info.discount_percent,threshold:info.discount_threshold,unit:info.discount_unit,scope:info.discount_scope},affects_operational_pricing:false}};
}

// Resolver-derived projection (pending public_private_tariff_projection SQL). Amounts come from the product
// tariff resolver (public channel), discount from the configured rule; only standard exact windows.
// Returns null for any error/malformed result: no guessed price, no legacy display amounts.
const resolvedSchema = z.object({
  ok: z.literal(true),
  windows: z.array(publicPrivateWindowSchema).min(1).max(48),
  discount: z.object({ percent: z.number().positive().max(100), threshold: z.number().int().positive(),
    unit: z.literal('minutes'), scope: z.literal('same_participant_same_day') }).strict(),
}).passthrough();
export function publicPrivateResolvedProjection(result: unknown) {
  const r = resolvedSchema.safeParse(result);
  if (!r.success || r.data.windows.some((w) => w.classification !== 'standard' || w.window_kind !== 'exact')) return null;
  const { windows, discount } = r.data;
  return {
    public_private_time_tariffs: { version: 1, purpose: 'display_information_only', currency: 'CHF', base_persons: 1,
      windows: windows.map(({ start, end, duration_minutes, amount_chf, extra_person_chf, classification, window_kind }) =>
        ({ start, end, duration_minutes, amount_chf, extra_person_chf, classification, window_kind })) },
    public_private_tariff_rules: { version: 1, extra_person_basis: 'per_window', discount, affects_operational_pricing: false },
  };
}
