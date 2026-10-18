/** Selection validation only: never releases booking or calculates prices. */
export interface SaturdayFacts {
  course_type: string | null;
  skill_level_id: string | null;
  product_type: string;
  saturday_product: boolean;
  periods: string[][];
}
const beginners = new Set(['ski_snow_kids', 'ski_blauer_prinz']);
export function saturdaySelectionError(facts: SaturdayFacts, dates: string[]): string | null {
  if (facts.course_type !== 'saturday_course') return facts.saturday_product ? 'Samstagsprodukt und Wochentagskurs dürfen nicht gemischt werden.' : null;
  if (!facts.saturday_product) return 'Für den Samstagskurs muss ein Samstagsprodukt gewählt werden.';
  const windel = facts.product_type === 'group_toddler' && facts.skill_level_id === 'ski_windel_wedel';
  if (facts.product_type === 'group_toddler' && !windel) return 'Produkt und Kursniveau passen nicht zusammen.';
  const max = windel ? 3 : 5;
  if (!dates.length || dates.length > max || new Set(dates).size !== dates.length) return `Bitte 1–${max} unterschiedliche Samstage derselben Serie wählen.`;
  const matches = facts.periods.filter(period => dates.every(date => period.includes(date)));
  if (matches.length !== 1) return 'Alle Samstage müssen zu genau einer bestehenden Serie gehören.';
  const offered = [...new Set(matches[0])].sort();
  if (!offered.length || offered.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T00:00:00Z').getUTCDay() !== 6)) return 'Die Samstagsserie ist ungültig.';
  if ((windel || beginners.has(facts.skill_level_id ?? '')) && !dates.includes(offered[0])) return `Der erste Samstag der Serie (${offered[0]}) ist für dieses Niveau erforderlich.`;
  return null;
}
// Facts come from the trusted server, never from the booking payload.
// deno-lint-ignore no-explicit-any
export async function checkSaturdaySelection(db: any, courseId: string, productId: string, dates: string[], periodKey?: string): Promise<string | null> {
  const [course, product, sources, periods] = await Promise.all([
    db.from('group_courses').select('course_type,skill_level_id').eq('id', courseId).maybeSingle(),
    db.from('products').select('type').eq('id', productId).maybeSingle(),
    db.from('bc_product_tariff_sources').select('source_family').eq('product_id', productId),
    db.from('bc_2627_course_period_sources').select('source_key,teaching_dates,eligible_variants').eq('course_id', courseId),
  ]);
  if ([course, product, sources, periods].some(result => result.error)) throw new Error('Saturday selection facts unavailable');
  if (!course.data || !product.data) return 'Kurs oder Produkt nicht gefunden.';
  return saturdaySelectionError({ ...course.data, product_type: product.data.type,
    saturday_product: (sources.data ?? []).some((source: {source_family: string}) => source.source_family === 'Samstagkurs'),
    periods: (periods.data ?? []).filter((period: {source_key: string; eligible_variants: Record<string, unknown>}) =>
      (!periodKey || period.source_key === periodKey) && Object.hasOwn(period.eligible_variants ?? {}, productId))
      .map((period: {teaching_dates: string[]}) => period.teaching_dates),
  }, dates);
}
