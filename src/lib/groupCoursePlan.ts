export interface GroupCourseScheduleFact {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export interface GroupCourseDateFact {
  date: string;
  is_cancelled: boolean;
}

export interface GroupCourseProductFact {
  id: string;
  name: string;
  type: string;
  is_active: boolean | null;
  season_id: string;
  season: { id: string; name: string; start_date: string; end_date: string } | null;
}

export interface GroupCourseFact {
  id: string;
  name: string;
  discipline: string;
  is_active: boolean | null;
  is_internal: boolean | null;
  course_type: string | null;
  period_start_date: string | null;
  period_end_date: string | null;
  meeting_point: string | null;
  max_participants: number;
  sort_order: number | null;
  product: GroupCourseProductFact | null;
  schedules: GroupCourseScheduleFact[];
  course_dates: GroupCourseDateFact[];
}

export interface GroupCourseBlock {
  date: string;
  startTime: string;
  endTime: string;
}

export interface BookableGroupCourse extends GroupCourseFact {
  blocks: GroupCourseBlock[];
  persistenceBlocker: string | null;
}

const dayOfWeek = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function buildBookableGroupCourses(
  courses: GroupCourseFact[],
  selectedDates: string[],
  sport: "ski" | "snowboard" | null,
  sourceBoundProductIds: Set<string> = new Set(),
): BookableGroupCourse[] {
  if (!sport || selectedDates.length === 0) return [];
  return courses.flatMap((course) => {
    if (course.is_active !== true || course.is_internal === true) return [];
    if (course.discipline !== sport && course.discipline !== "both") return [];
    const product = course.product;
    if (!product || product.is_active !== true || !["group", "group_toddler"].includes(product.type)) return [];
    const season = product.season;
    if (!season || selectedDates.some((date) => date < season.start_date || date > season.end_date)) return [];
    if (sourceBoundProductIds.has(product.id) || season.name === "Winter 26/27") return [];
    if (course.period_start_date && selectedDates.some((date) => date < course.period_start_date)) return [];
    if (course.period_end_date && selectedDates.some((date) => date > course.period_end_date)) return [];

    if (course.course_type === "saturday_course") {
      const released = new Set(course.course_dates.filter((d) => !d.is_cancelled).map((d) => d.date));
      if (selectedDates.some((date) => !released.has(date))) return [];
    }

    const blocks = selectedDates.flatMap((date) => course.schedules
      .filter((schedule) => schedule.is_active && schedule.day_of_week === dayOfWeek(date))
      .map((schedule) => ({ date, startTime: schedule.start_time.slice(0, 5), endTime: schedule.end_time.slice(0, 5) })));
    if (selectedDates.some((date) => !blocks.some((block) => block.date === date))) return [];
    const splitDate = selectedDates.find((date) => blocks.filter((block) => block.date === date).length !== 1);
    return [{
      ...course,
      blocks,
      persistenceBlocker: splitDate
        ? "Dieser Kurs hat an mindestens einem Tag mehrere Zeitblöcke. Der aktuelle Buchungsweg kann diese noch nicht verlustfrei speichern."
        : null,
    }];
  }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "de"));
}

export function groupCourseEmptyMessage(selectedDates: string[], sport: "ski" | "snowboard" | null): string {
  if (!sport) return "Zuerst Ski oder Snowboard wählen.";
  if (selectedDates.length === 0) return "Zuerst Kurstage wählen.";
  if (selectedDates.some((date) => date >= "2026-12-01")) {
    return "Für diese Daten ist noch kein Kurs freigegeben. Der Buchungsweg für Winter 26/27 ist noch nicht aktiv.";
  }
  return "Für Sportart und alle gewählten Tage ist kein freigegebener Kurs verfügbar.";
}
// ---------- 26/27 staff server path (bc_2627_staff_group_* SQL via `staff-group-booking`) ----------

/** One bookable option as returned by the server (exact instances + exact source quote). */
export interface ServerGroupOption {
  course_id: string;
  course_name: string;
  discipline: string;
  skill_level_id: string | null;
  meeting_point: string | null;
  max_participants: number | null;
  sort_order: number | null;
  product_id: string;
  product_name: string;
  duration_minutes: number;
  block: "am" | "pm" | null;
  blocks: Array<{ date: string; time_start: string; time_end: string }>;
  unit_price: number;
}

/** Server booking reference carried in the plan; the server re-checks everything. */
export interface ServerGroupRef {
  courseId: string;
  productId: string;
  block: "am" | "pm" | null;
  unitPrice: number;
}

export type BookableGroupOption = BookableGroupCourse & { server?: ServerGroupRef };

export const SERVER_OPTION_PREFIX = "bc2627:";

export function serverOptionKey(o: Pick<ServerGroupOption, "course_id" | "product_id" | "block">): string {
  return `${SERVER_OPTION_PREFIX}${o.course_id}:${o.product_id}:${o.block ?? "all"}`;
}

export function serverOptionToBookable(o: ServerGroupOption): BookableGroupOption {
  const blockLabel = o.block === "am" ? " (Vormittag)" : o.block === "pm" ? " (Nachmittag)" : "";
  return {
    id: serverOptionKey(o),
    name: o.course_name,
    discipline: o.discipline,
    is_active: true,
    is_internal: false,
    course_type: "weekly",
    period_start_date: null,
    period_end_date: null,
    meeting_point: o.meeting_point,
    max_participants: o.max_participants ?? 0,
    sort_order: o.sort_order,
    product: { id: o.product_id, name: `${o.product_name}${blockLabel}`, type: "group", is_active: true, season_id: "", season: null },
    schedules: [],
    course_dates: [],
    blocks: o.blocks.map((b) => ({ date: b.date, startTime: b.time_start.slice(0, 5), endTime: b.time_end.slice(0, 5) })),
    persistenceBlocker: null,
    server: { courseId: o.course_id, productId: o.product_id, block: o.block, unitPrice: Number(o.unit_price) },
  };
}

/** Full-content equality of a selected plan (course, product, meeting point, server ref, every block). */
export function sameGroupPlan(
  a: { courseId: string; productName: string | null; meetingPoint: string | null; blocks: GroupCourseBlock[]; persistenceBlocker: string | null; server?: ServerGroupRef | null } | null,
  b: { courseId: string; productName: string | null; meetingPoint: string | null; blocks: GroupCourseBlock[]; persistenceBlocker: string | null; server?: ServerGroupRef | null } | null,
): boolean {
  if (!a || !b) return a === b;
  const key = (blocks: GroupCourseBlock[]) => blocks.map((x) => `${x.date} ${x.startTime}-${x.endTime}`).sort().join("|");
  return a.courseId === b.courseId && a.productName === b.productName && a.meetingPoint === b.meetingPoint
    && a.persistenceBlocker === b.persistenceBlocker && key(a.blocks) === key(b.blocks)
    && JSON.stringify(a.server ?? null) === JSON.stringify(b.server ?? null);
}

export type ServerCapability = "installed" | "not_installed" | "error";

export function groupCourseEmptyMessageFor(selectedDates: string[], sport: "ski" | "snowboard" | null, server: ServerCapability | undefined): string {
  if (!sport || selectedDates.length === 0 || !selectedDates.some((d) => d >= "2026-12-01")) return groupCourseEmptyMessage(selectedDates, sport);
  if (server === "installed") return "Für Sportart und alle gewählten Tage ist kein Winter-26/27-Kurs zur Buchung freigegeben (Kurs oder Produkt nicht aktiv, oder kein exakter Tarif).";
  if (server === "error") return "Winter-26/27-Kurse konnten nicht geprüft werden. Bitte erneut versuchen.";
  return groupCourseEmptyMessage(selectedDates, sport);
}
