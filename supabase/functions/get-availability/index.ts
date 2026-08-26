// Public endpoint: availability check for the website calendar.
// Input: { date_from, date_to, product_id?, duration_minutes? }
// Output: per date, the bookable start slots with the number of free instructors,
// plus blocked times. All times are local wall-clock times (Europe/Zurich operating hours 09:00-16:00).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

const Payload = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z.number().int().min(30).max(480).default(120),
});

const OPEN_MIN = 9 * 60;  // 09:00
const CLOSE_MIN = 16 * 60; // 16:00
const STEP_MIN = 30;

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const parsed = Payload.safeParse(body);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  const { date_from, date_to, duration_minutes } = parsed.data;

  if (date_to < date_from) return json({ error: "date_to must be >= date_from" }, 400);
  const today = new Date().toISOString().slice(0, 10);
  const effFrom = date_from < today ? today : date_from;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: instructors } = await supabase
      .from("instructors")
      .select("id, first_name, last_name")
      .eq("status", "active");
    const instructorIds = (instructors ?? []).map((i) => i.id);

    // Active bookings (confirmed, provisional, booked, pending etc. block capacity; cancelled/expired do not)
    const { data: items } = await supabase
      .from("ticket_items")
      .select("instructor_id, date, time_start, time_end, tickets!inner(status)")
      .gte("date", effFrom)
      .lte("date", date_to)
      .not("instructor_id", "is", null)
      .not("tickets.status", "in", '("cancelled","storno","expired")');

    const { data: absences } = await supabase
      .from("instructor_absences")
      .select("instructor_id, start_date, end_date, time_start, time_end, is_full_day")
      .in("status", ["approved", "pending"])
      .lte("start_date", date_to)
      .gte("end_date", effFrom);

    const { data: blocks } = await supabase
      .from("instructor_recurring_blocks")
      .select("instructor_id, start_time, end_time, weekdays, valid_from, valid_until")
      .eq("is_active", true)
      .in("status", ["approved", "pending"])
      .lte("valid_from", date_to);

    // Build per-date busy intervals per instructor
    const busy = new Map<string, Map<string, [number, number][]>>(); // date -> instructor -> intervals
    const addBusy = (date: string, instructorId: string, s: number, e: number) => {
      if (!busy.has(date)) busy.set(date, new Map());
      const m = busy.get(date)!;
      if (!m.has(instructorId)) m.set(instructorId, []);
      m.get(instructorId)!.push([s, e]);
    };

    for (const it of items ?? []) {
      addBusy(it.date, it.instructor_id, toMin(it.time_start), toMin(it.time_end));
    }
    for (const a of absences ?? []) {
      for (let d = maxDate(a.start_date, effFrom); d <= a.end_date && d <= date_to; d = nextDate(d)) {
        if (a.is_full_day) addBusy(d, a.instructor_id, OPEN_MIN, CLOSE_MIN);
        else if (a.time_start && a.time_end) addBusy(d, a.instructor_id, toMin(a.time_start), toMin(a.time_end));
      }
    }
    for (const b of blocks ?? []) {
      const until = b.valid_until && b.valid_until < date_to ? b.valid_until : date_to;
      for (let d = maxDate(b.valid_from, effFrom); d <= until; d = nextDate(d)) {
        const dow = new Date(d + "T12:00:00Z").getUTCDay();
        if (b.weekdays?.includes(dow)) addBusy(d, b.instructor_id, toMin(b.start_time), toMin(b.end_time));
      }
    }

    // Build day list
    const days: any[] = [];
    for (let d = effFrom; d <= date_to; d = nextDate(d)) {
      const dayBusy = busy.get(d) ?? new Map();
      const slots: any[] = [];
      for (let start = OPEN_MIN; start + duration_minutes <= CLOSE_MIN; start += STEP_MIN) {
        const end = start + duration_minutes;
        const freeInstructors = instructorIds.filter((id) => {
          const intervals = dayBusy.get(id) ?? [];
          return !intervals.some(([s, e]) => s < end && e > start);
        });
        if (freeInstructors.length > 0) {
          slots.push({
            start: toHHMM(start),
            end: toHHMM(end),
            free_instructors: freeInstructors.length,
          });
        }
      }
      const weekday = new Date(d + "T12:00:00Z").getUTCDay(); // 0=Sun..6=Sat
      days.push({
        date: d,
        weekday,
        is_saturday: weekday === 6,
        is_weekday: weekday >= 1 && weekday <= 5,
        fully_booked: slots.length === 0,
        slots,
      });
    }

    return json({ success: true, timezone: "Europe/Zurich", open: "09:00", close: "16:00", days });
  } catch (e) {
    console.error("get-availability error:", e);
    return json({ error: "Internal error", message: (e as Error).message }, 500);
  }
});

function nextDate(d: string): string {
  const dt = new Date(d + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}
