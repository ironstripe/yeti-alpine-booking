/** Product-scoped informational schedule. Never a booking/price/capacity decision. */
export type ScheduleKind = 'weekly' | 'explicit_dates' | 'flexible_private';
export type TimeBlock = { start: string; end: string };
export type ProductSeries = { sequence: number; label?: string | null; start_date: string; end_date: string; max_selected_days: number };
export type ProductOffering = { schedule_kind: ScheduleKind; weekdays: number[]; dates: string[]; time_blocks: TimeBlock[]; display_schedule_text?: string | null; series?: ProductSeries[] };
export type OfferingContext = { type: string; duration_minutes: number | null; season?: { start_date: string; end_date: string } | null };
export const weekdayLabels = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const clock = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export function offeringDuration(blocks: TimeBlock[]): number { return blocks.reduce((sum, b) => sum + minutes(b.end) - minutes(b.start), 0); }
/** Confirmed rule: each booked clock block includes a 5-minute change-over; effective teaching = clock - 5 per block. Scheduling/payroll always use the clock length. */
export const TEACHING_CHANGEOVER_MINUTES = 5;
export function effectiveBlockMinutes(b: TimeBlock): number { const m = minutes(b.end) - minutes(b.start); return Number.isFinite(m) && m > TEACHING_CHANGEOVER_MINUTES ? m - TEACHING_CHANGEOVER_MINUTES : 0; }
export function normalizeScheduleText(text?: string | null): string | null { return text?.trim() || null; }
export function validateScheduleText(text: unknown): string | null {
  if (text == null) return null;
  if (typeof text !== 'string') return 'Website-Text muss einfacher Text sein';
  if (Array.from(text.trim()).length > 160) return 'Website-Text darf höchstens 160 Zeichen enthalten';
  if (/[<>\u0000-\u001f\u007f]/.test(text)) return 'Website-Text muss einzeiliger Text ohne HTML sein';
  return null;
}

const validDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
/** Generated from the authoritative weekday schedule; never inferred from labels. */
export function seriesDates(series: ProductSeries, weekdays: number[]): string[] {
  if (!validDate(series.start_date) || !validDate(series.end_date) || series.start_date > series.end_date) return [];
  const start = Date.parse(series.start_date), end = Date.parse(series.end_date);
  if ((end-start)/86400000 > 366) return [];
  const dates: string[] = [];
  for (let day=start; day<=end; day+=86400000) {
    const date=new Date(day);
    if (weekdays.includes(date.getUTCDay() || 7)) dates.push(date.toISOString().slice(0,10));
  }
  return dates;
}
export function validateSeries(o: ProductOffering, context: OfferingContext): string | null {
  if (o.series === undefined) return null;
  if (!Array.isArray(o.series) || o.series.length > 24) return 'Höchstens 24 Serien möglich';
  if (o.series.length && o.schedule_kind !== 'weekly') return 'Serien benötigen wöchentliche Wochentage';
  for (const [i,s] of o.series.entries()) {
    if (!s || s.sequence !== i+1 || !Number.isInteger(s.max_selected_days) || s.max_selected_days < 1 || s.max_selected_days > 366) return 'Serienfolge und maximale Anzahl Tage prüfen';
    const labelError=validateScheduleText(s.label); if(labelError) return labelError;
    if (!validDate(s.start_date) || !validDate(s.end_date) || s.start_date > s.end_date) return 'Gültigen Serienzeitraum angeben';
    if (context.season && (s.start_date < context.season.start_date || s.end_date > context.season.end_date)) return 'Serie liegt ausserhalb der Saison';
    if (!seriesDates(s,o.weekdays).length) return 'Serie enthält keine angebotenen Wochentage';
    if (o.series.some((other,j)=>j<i && s.start_date<=other.end_date && other.start_date<=s.end_date)) return 'Serien dürfen sich nicht überschneiden';
  }
  return null;
}
/** Preview/future quote contract only: exact existing tier, once, within one series. */
export function seriesSelection(o: ProductOffering, sequence: number, dates: string[], tiers: {day_count:number;cumulative_price:number}[]): {price:number|null; error:string|null} {
  const series=o.series?.find(s=>s.sequence===sequence);
  if (!series || !dates.length || new Set(dates).size!==dates.length || dates.length>series.max_selected_days) return {price:null,error:'Anzahl Tage innerhalb einer Serie prüfen'};
  const offered=new Set(seriesDates(series,o.weekdays));
  if(dates.some(d=>!offered.has(d))) return {price:null,error:'Alle Tage müssen innerhalb derselben Serie liegen'};
  const tier=tiers.find(t=>t.day_count===dates.length && Number.isFinite(t.cumulative_price) && t.cumulative_price>0);
  return tier ? {price:tier.cumulative_price,error:null} : {price:null,error:'Für diese Anzahl Tage ist kein Tarif hinterlegt'};
}

export function validateOffering(input: unknown, context: OfferingContext): string | null {
  if (!input || typeof input !== 'object') return 'Ungültige Website-Informationen';
  const o = input as ProductOffering;
  const textError = validateScheduleText(o.display_schedule_text);
  if (textError) return textError;
  if (!['weekly', 'explicit_dates', 'flexible_private'].includes(o.schedule_kind) || !Array.isArray(o.weekdays) || !Array.isArray(o.dates) || !Array.isArray(o.time_blocks)) return 'Ungültiges Terminmodell';
  const seriesError=validateSeries(o,context); if(seriesError) return seriesError;
  if (o.schedule_kind === 'flexible_private') {
    if (context.type !== 'private' || o.weekdays.length || o.dates.length || o.time_blocks.length) return 'Flexible Termine sind nur für Privatstunden ohne feste Zeiten möglich';
    return null;
  }
  if (o.schedule_kind === 'weekly') {
    if (!o.weekdays.length || o.weekdays.some(d => !Number.isInteger(d) || d < 1 || d > 7) || new Set(o.weekdays).size !== o.weekdays.length || o.dates.length) return 'Wochentage 1–7 auswählen, ohne Duplikate';
  } else {
    if (o.weekdays.length || !o.dates.length || o.dates.length > 366 || new Set(o.dates).size !== o.dates.length) return 'Eindeutige Termine auswählen';
    for (const d of o.dates) {
      if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) return 'Ungültiges Datum';
      if (context.season && (d < context.season.start_date || d > context.season.end_date)) return 'Termin liegt ausserhalb der Saison';
    }
  }
  if (o.time_blocks.length < 1 || o.time_blocks.length > 2) return 'Ein oder zwei Zeitblöcke erforderlich';
  for (const b of o.time_blocks) {
    if (!b || typeof b.start !== 'string' || typeof b.end !== 'string' || !clock(b.start) || !clock(b.end) || b.start >= b.end) return 'Beginn und Ende als gültige Uhrzeiten angeben';
  }
  if (o.time_blocks.length === 2) {
    const [a, b] = o.time_blocks;
    if (a.start < b.end && b.start < a.end) return 'Zeitblöcke dürfen sich nicht überschneiden';
  }
  return null;
}
export function offeringPreview(o: ProductOffering | null): string {
  if (!o) return 'Keine Angebotszeiten hinterlegt';
  const text = normalizeScheduleText(o.display_schedule_text);
  if (o.schedule_kind === 'flexible_private') return text ?? 'Privatstunden nach Verfügbarkeit';
  const seriesLabel=o.series?.length ? o.series.map(s=>`${s.label?.trim() || `Serie ${s.sequence}`}: ${s.start_date.split('-').reverse().join('.')}–${s.end_date.split('-').reverse().join('.')}`).join(' · ') : null;
  const days = text ?? seriesLabel ?? (o.schedule_kind === 'weekly' ? o.weekdays.map(d => `Jeden ${weekdayLabels[d - 1]}`).join(', ') : o.dates.map(d => d.split('-').reverse().join('.')).join(', '));
  const effective = o.time_blocks.map(effectiveBlockMinutes);
  const known = effective.length > 0 && effective.every(m => m > 0);
  const label = !known ? '' : new Set(effective).size === 1 ? `${effective.length > 1 ? `${effective.length} × ` : ''}${effective[0]} Min. Unterricht` : `${effective.join(' + ')} Min. Unterricht`;
  return `${days} · ${o.time_blocks.map(b => `${b.start || '…'}–${b.end || '…'}`).join(' + ')}${label ? ` · ${label}` : ''}`;
}
