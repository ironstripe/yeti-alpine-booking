/** Product-scoped informational schedule. Never a booking/price/capacity decision. */
export type ScheduleKind = 'weekly' | 'explicit_dates' | 'flexible_private';
export type TimeBlock = { start: string; end: string };
export type ProductOffering = { schedule_kind: ScheduleKind; weekdays: number[]; dates: string[]; time_blocks: TimeBlock[]; display_schedule_text?: string | null };
export type OfferingContext = { type: string; duration_minutes: number | null; season?: { start_date: string; end_date: string } | null };
export const weekdayLabels = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const clock = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export function offeringDuration(blocks: TimeBlock[]): number { return blocks.reduce((sum, b) => sum + minutes(b.end) - minutes(b.start), 0); }
export function normalizeScheduleText(text?: string | null): string | null { return text?.trim() || null; }
export function validateScheduleText(text: unknown): string | null {
  if (text == null) return null;
  if (typeof text !== 'string') return 'Website-Text muss einfacher Text sein';
  if (Array.from(text.trim()).length > 160) return 'Website-Text darf höchstens 160 Zeichen enthalten';
  if (/[<>\u0000-\u001f\u007f]/.test(text)) return 'Website-Text muss einzeiliger Text ohne HTML sein';
  return null;
}
export function validateOffering(input: unknown, context: OfferingContext): string | null {
  if (!input || typeof input !== 'object') return 'Ungültige Website-Informationen';
  const o = input as ProductOffering;
  const textError = validateScheduleText(o.display_schedule_text);
  if (textError) return textError;
  if (!['weekly', 'explicit_dates', 'flexible_private'].includes(o.schedule_kind) || !Array.isArray(o.weekdays) || !Array.isArray(o.dates) || !Array.isArray(o.time_blocks)) return 'Ungültiges Terminmodell';
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
  if (context.duration_minutes && offeringDuration(o.time_blocks) !== context.duration_minutes) return `Zeitblöcke müssen zusammen ${context.duration_minutes} Minuten ergeben`;
  return null;
}
export function offeringPreview(o: ProductOffering | null): string {
  if (!o) return 'Keine Angebotszeiten hinterlegt';
  const text = normalizeScheduleText(o.display_schedule_text);
  if (o.schedule_kind === 'flexible_private') return text ?? 'Privatstunden nach Verfügbarkeit';
  const days = text ?? (o.schedule_kind === 'weekly' ? o.weekdays.map(d => `Jeden ${weekdayLabels[d - 1]}`).join(', ') : o.dates.map(d => d.split('-').reverse().join('.')).join(', '));
  const duration = offeringDuration(o.time_blocks);
  return `${days} · ${o.time_blocks.map(b => `${b.start || '…'}–${b.end || '…'}`).join(' + ')}${Number.isFinite(duration) && duration > 0 ? ` · ${duration} Min. pro Tag` : ''}`;
}
