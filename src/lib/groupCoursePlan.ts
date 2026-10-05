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
): BookableGroupCourse[] {
  if (!sport || selectedDates.length === 0) return [];
  return courses.flatMap((course) => {
    if (course.is_active !== true || course.is_internal === true) return [];
    if (course.discipline !== sport && course.discipline !== "both") return [];
    const product = course.product;
    if (!product || product.is_active !== true || !["group", "group_toddler"].includes(product.type)) return [];
    const season = product.season;
    if (!season || selectedDates.some((date) => date < season.start_date || date > season.end_date)) return [];
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