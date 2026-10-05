// Pure helpers for course archive / guarded delete / rename outcomes.
// All writes go through the office/admin Edge Function `course-management`; never a raw DELETE.

export type CourseDependencies = Partial<Record<
  | "enrollments" | "original_course_refs" | "event_refs" | "participant_course_refs" | "next_course_refs"
  | "assigned_instances" | "assigned_groups" | "assigned_dates" | "shift_assignments" | "transfer_requests"
  | "notification_refs" | "merge_refs" | "foreign_source_links"
  // owned technical structure — removed with the course, never blocking
  | "source_period_links" | "source_product_links" | "instances" | "groups" | "schedules" | "dates",
  number
>>;

export type CourseActionOutcome =
  | { kind: "ok" }
  | { kind: "referenced"; dependencies: CourseDependencies }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "not_installed" }
  // verified = state re-read after the failure and confirmed unchanged
  | { kind: "network"; verified?: boolean }
  | { kind: "server"; verified?: boolean }
  // request may have committed and the read-back failed too
  | { kind: "unknown" };

// Genuine usage only. Source-period/product links and empty generated structure never block.
const LABELS: Array<[keyof CourseDependencies, (n: number) => string]> = [
  ["enrollments", (n) => `${n} Kursanmeldung${n === 1 ? "" : "en"} – zuerst umbuchen oder stornieren`],
  ["original_course_refs", (n) => `${n} umgebuchte Anmeldung${n === 1 ? "" : "en"} verweis${n === 1 ? "t" : "en"} auf diesen Kurs (Buchungshistorie)`],
  ["event_refs", (n) => `${n} Event-Kategorie${n === 1 ? "" : "n"} – Kategorie im Event zuerst ändern`],
  ["participant_course_refs", (n) => `${n} Teilnehmende mit diesem Kurs als aktuellem Kurs – im Teilnehmerprofil ändern`],
  ["next_course_refs", (n) => `${n} Kurs${n === 1 ? "" : "e"} mit diesem Kurs als Folgekurs – dort Folgekurs ändern`],
  ["assigned_instances", (n) => `${n} Einheit${n === 1 ? "" : "en"} mit zugewiesener Lehrperson – Zuweisung in der Planung entfernen`],
  ["assigned_groups", (n) => `${n} Gruppe${n === 1 ? "" : "n"} mit zugewiesener Lehrperson – Zuweisung in der Planung entfernen`],
  ["assigned_dates", (n) => `${n} Kurstag${n === 1 ? "" : "e"} mit Lehrperson – Zuweisung entfernen`],
  ["shift_assignments", (n) => `${n} Schichtzuweisung${n === 1 ? "" : "en"}`],
  ["transfer_requests", (n) => `${n} Umteilungsanfrage${n === 1 ? "" : "n"}`],
  ["notification_refs", (n) => `${n} Lehrer-Benachrichtigung${n === 1 ? "" : "en"} (Verlauf)`],
  ["merge_refs", (n) => `${n} Gruppenzusammenlegung${n === 1 ? "" : "en"} mit einem anderen Kurs`],
  ["foreign_source_links", (n) => `${n} Importverknüpfung${n === 1 ? "" : "en"} eines anderen Kurses auf diese Gruppen`],
];

/** Human-readable blocking dependencies (generated instances/dates alone never block). */
export function describeBlockingDependencies(deps: CourseDependencies): string[] {
  return LABELS.filter(([k]) => (deps[k] ?? 0) > 0).map(([k, f]) => f(deps[k]!));
}

export function isDeletable(deps: CourseDependencies): boolean {
  return describeBlockingDependencies(deps).length === 0;
}

/** Classify an Edge Function invoke result (supabase-js FunctionsHttpError / FunctionsFetchError). */
export async function classifyInvoke(
  data: unknown,
  error: { name?: string; context?: { status?: number; json?: () => Promise<unknown> } } | null,
): Promise<CourseActionOutcome> {
  if (!error) {
    const d = (data ?? {}) as Record<string, unknown>;
    if (d.ok === true) return { kind: "ok" };
    return { kind: "server" }; // never report success without an explicit server ok
  }
  if (error.name === "FunctionsFetchError") return { kind: "network" };
  if (error.name === "FunctionsRelayError") return { kind: "server" };
  const status = error.context?.status;
  let body: Record<string, unknown> = {};
  try { body = ((await error.context?.json?.()) ?? {}) as Record<string, unknown>; } catch { /* non-JSON */ }
  if (status === 409 && body.error === "referenced") {
    return { kind: "referenced", dependencies: (body.dependencies ?? {}) as CourseDependencies };
  }
  if (status === 404 && body.error === "not_found") return { kind: "not_found" };
  if (status === 404 || status === 503 || body.error === "not_installed") return { kind: "not_installed" };
  if (status === 401) return { kind: "unauthenticated" };
  if (status === 403) return { kind: "forbidden" };
  return { kind: "server" };
}

/** Outcomes where the server may or may not have committed; must be read back before reporting. */
export function needsReadback(o: CourseActionOutcome): boolean {
  return (o.kind === "network" || o.kind === "server") && !o.verified;
}

export function outcomeMessage(o: CourseActionOutcome): string {
  switch (o.kind) {
    case "ok": return "";
    case "referenced": {
      const list = describeBlockingDependencies(o.dependencies);
      return `Löschen nicht möglich: ${list.join("; ") || "abhängige Daten vorhanden"}. Nichts wurde geändert.`;
    }
    case "not_found": return "Dieser Kurs existiert nicht mehr. Die Liste wird neu geladen.";
    case "forbidden": return "Keine Berechtigung. Nur Büro und Admin dürfen Kurse archivieren oder löschen.";
    case "unauthenticated": return "Sitzung abgelaufen. Bitte neu anmelden.";
    case "not_installed": return "Archivieren und sicheres Löschen sind auf dem Server noch nicht installiert.";
    case "network": return o.verified
      ? "Keine Verbindung zum Server. Neu geladen: Der Kurs ist unverändert; bitte erneut versuchen."
      : "Keine Verbindung zum Server. Ergebnis unbekannt – bitte Liste neu laden und prüfen.";
    case "server": return o.verified
      ? "Serverfehler. Neu geladen: Der Kurs ist unverändert; bitte erneut versuchen."
      : "Serverfehler. Ergebnis unbekannt – bitte Liste neu laden und prüfen.";
    case "unknown": return "Ergebnis unbekannt: Die Verbindung brach ab und der aktuelle Stand konnte nicht geladen werden. Bitte Liste neu laden und prüfen, bevor du es erneut versuchst.";
  }
}

/** Interpret a read-back after an uncertain outcome. row = current course row or null if gone. */
export function resolveReadback(
  action: "archive" | "restore" | "delete",
  original: CourseActionOutcome,
  row: { archived_at?: string | null } | null | undefined,
  readError: boolean,
): CourseActionOutcome {
  if (readError || row === undefined) return { kind: "unknown" };
  const done = action === "delete" ? row === null
    : action === "archive" ? !!row?.archived_at
    : !!row && !row.archived_at;
  if (done) return { kind: "ok" };
  if (row === null) return { kind: "not_found" };
  return original.kind === "network" ? { kind: "network", verified: true } : { kind: "server", verified: true };
}

/** All react-query keys whose screens show courses, their names, groups or generated sessions. */
const COURSE_KEYS = new Set([
  "group-courses", "group-course", "bookable-group-courses", "course-dependencies", "groups",
  "unassigned-groups-check", "transfer-requests", "office-shift-assignments", "trainings",
]);
export function isCourseRelatedQueryKey(key: readonly unknown[]): boolean {
  const k = typeof key[0] === "string" ? key[0] : "";
  return COURSE_KEYS.has(k) || k.startsWith("group-") || k.startsWith("scheduler-")
    || k.startsWith("live-planning") || k.startsWith("instructor-portal");
}

export function validateCourseName(name: string, current: string): string | null {
  const v = name.trim();
  if (!v) return "Kursname darf nicht leer sein.";
  if (v.length > 120) return "Kursname ist zu lang (max. 120 Zeichen).";
  if (v === current.trim()) return "Der Name ist unverändert.";
  return null;
}
