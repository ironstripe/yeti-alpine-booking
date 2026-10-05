// Pure helpers for course archive / guarded delete / rename outcomes.
// All writes go through the office/admin Edge Function `course-management`; never a raw DELETE.

export type CourseDependencies = Partial<Record<
  | "enrollments" | "original_course_refs" | "event_refs" | "source_period_links" | "source_product_links"
  | "assigned_instances" | "assigned_dates" | "shift_assignments" | "transfer_requests" | "instances" | "dates",
  number
>>;

export type CourseActionOutcome =
  | { kind: "ok" }
  | { kind: "referenced"; dependencies: CourseDependencies }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "not_installed" }
  | { kind: "network" }
  | { kind: "server" };

const LABELS: Array<[keyof CourseDependencies, (n: number) => string]> = [
  ["enrollments", (n) => `${n} Kursanmeldung${n === 1 ? "" : "en"}`],
  ["original_course_refs", (n) => `${n} Verweis${n === 1 ? "" : "e"} aus umgebuchten Anmeldungen`],
  ["event_refs", (n) => `${n} Event-Kategorie${n === 1 ? "" : "n"}`],
  ["source_period_links", (n) => `${n} Import-Periodenverknüpfung${n === 1 ? "" : "en"} (26/27)`],
  ["source_product_links", (n) => `${n} Import-Produktverknüpfung${n === 1 ? "" : "en"} (26/27)`],
  ["assigned_instances", (n) => `${n} geplante Einheit${n === 1 ? "" : "en"} mit Lehrperson`],
  ["assigned_dates", (n) => `${n} Kurstag${n === 1 ? "" : "e"} mit Lehrperson`],
  ["shift_assignments", (n) => `${n} Schichtzuweisung${n === 1 ? "" : "en"}`],
  ["transfer_requests", (n) => `${n} Umteilungsanfrage${n === 1 ? "" : "n"}`],
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

export function outcomeMessage(o: CourseActionOutcome): string {
  switch (o.kind) {
    case "ok": return "";
    case "referenced": return `Löschen nicht möglich: ${describeBlockingDependencies(o.dependencies).join(", ") || "abhängige Daten vorhanden"}. Stattdessen archivieren.`;
    case "not_found": return "Dieser Kurs existiert nicht mehr. Die Liste wird neu geladen.";
    case "forbidden": return "Keine Berechtigung. Nur Büro und Admin dürfen Kurse archivieren oder löschen.";
    case "unauthenticated": return "Sitzung abgelaufen. Bitte neu anmelden.";
    case "not_installed": return "Archivieren und sicheres Löschen sind auf dem Server noch nicht installiert.";
    case "network": return "Keine Verbindung zum Server. Es wurde nichts geändert; bitte erneut versuchen.";
    case "server": return "Serverfehler. Es wurde nichts bestätigt; bitte erneut versuchen.";
  }
}

export function validateCourseName(name: string, current: string): string | null {
  const v = name.trim();
  if (!v) return "Kursname darf nicht leer sein.";
  if (v.length > 120) return "Kursname ist zu lang (max. 120 Zeichen).";
  if (v === current.trim()) return "Der Name ist unverändert.";
  return null;
}
