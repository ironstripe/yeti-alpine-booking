// Pure helpers for creating/updating group courses (issue #46).
// The form labels age fields "Optional", but group_courses.min_age/max_age are NOT NULL
// and the validate_group_course_ages trigger requires 1 <= min_age <= max_age <= 99.
// A blank field therefore means "no restriction" = the widest range the database allows.

export const AGE_FLOOR = 1;
export const AGE_CEILING = 99;

export function normalizeCourseAges(
  min: number | null | undefined,
  max: number | null | undefined,
): { min_age: number; max_age: number } {
  return {
    min_age: min == null || Number.isNaN(min) ? AGE_FLOOR : min,
    max_age: max == null || Number.isNaN(max) ? AGE_CEILING : max,
  };
}

/** Human (German) message for a failed course save; never a false success. */
export function describeCourseSaveError(
  error: unknown,
  cleanup?: 'removed' | 'failed',
): string {
  const e = (error ?? {}) as { code?: string; message?: string };
  const msg = e.message ?? '';
  let reason: string;
  if (e.code === '23502') reason = 'Pflichtfeld fehlt.';
  else if (msg.includes('min_age') || msg.includes('max_age'))
    reason = 'Ungültiges Alter (Mindestalter ≥ 1, Höchstalter ≤ 99 und nicht kleiner als Mindestalter).';
  else if (e.code === '42501') reason = 'Keine Berechtigung.';
  else reason = msg || 'Unbekannter Fehler.';
  const tail = cleanup === 'removed'
    ? ' Der unvollständige Kurs wurde wieder entfernt.'
    : cleanup === 'failed'
      ? ' Achtung: Der Kurs wurde ohne alle Unterrichtszeiten angelegt und konnte nicht automatisch entfernt werden – bitte in der Kursliste prüfen.'
      : '';
  return `Fehler beim Erstellen des Trainings: ${reason}${tail}`;
}
