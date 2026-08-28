// Public endpoint: availability check for the website calendar.
// Input: { date_from, date_to, duration_minutes? }
// Output: per date, all bookable start slots with the number (and IDs) of free instructors,
// plus an `available` flag. Times are local wall-clock (Europe/Zurich, 09:00-16:00).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

const Payload = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z.number().int().min(30).max(480).default(120),
  include_unavailable: z.boolean().default(true),
});

const OPEN_MIN = 9 * 60;  // 09:00
const CLOSE_MIN = 16 * 60; // 16:00
const STEP_MIN = 30;

// Ticket statuses that do NOT block capacity
const NON_BLOCKING_TICKET_STATUS = new Set(["cancelled", "storno", "expired", "rejected"]);
// Ticket item statuses that do NOT block capacity
const NON_BLOCKING_ITEM_STATUS = new Set(["cancelled", "storno", "expired"]);

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
  const { date_from, date_to, duration_minutes, include_unavailable } = parsed.data;

  if (date_to < date_from) return json({ error: "date_to must be >= date_from" }, 400);
  const today = new Date().toISOString().slice(0, 10);
  const effFrom = date_from < today ? today : date_from;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: instructors, error: instErr } = await supabase
      .from("instructors")
      .select("id, first_name, last_name, roles")
      .eq("status", "active");
    if (instErr) throw new Error(`instructors: ${instErr.message}`);
    const TEACHING_ROLES = ["ski", "snowboard", "telemark", "langlauf"];
    const teachingInstructors = (instructors ?? []).filter(
      (i: any) => !i.roles || i.roles.length === 0 || i.roles.some((r: string) => TEACHING_ROLES.includes(r)),
    );
    const instructorIds = teachingInstructors.map((i) => i.id);

    // Private lessons / reservations. Status filtering is done in JS so that a
    // malformed embedded filter can never silently return "everything is free".
    const { data: items, error: itemsErr } = await supabase
      .from("ticket_items")
      .select("instructor_id, date, time_start, time_end, status, tickets!inner(status)")
      .gte("date", effFrom)
      .lte("date", date_to)
      .not("instructor_id", "is", null);
    if (itemsErr) throw new Error(`ticket_items: ${itemsErr.message}`);

    // Group course instances also occupy the instructor
    const { data: groupInstances, error: giErr } = await supabase
      .from("group_course_instances")
      .select("instructor_id, assistant_instructor_id, date, start_time, end_time, status")
      .gte("date", effFrom)
      .lte("date", date_to);
    if (giErr) throw new Error(`group_course_instances: ${giErr.message}`);

    const { data: absences, error: absErr } = await supabase
      .from("instructor_absences")
      .select("instructor_id, start_date, end_date, time_start, time_end, is_full_day")
      .in("status", ["approved", "pending"])
      .lte("start_date", date_to)
      .gte("end_date", effFrom);
    if (absErr) throw new Error(`instructor_absences: ${absErr.message}`);

    const { data: blocks, error: blkErr } = await supabase
      .from("instructor_recurring_blocks")
      .select("instructor_id, start_time, end_time, weekdays, valid_from, valid_until")
      .eq("is_active", true)
      .in("status", ["approved", "pending"])
      .lte("valid_from", date_to);
    if (blkErr) throw new Error(`instructor_recurring_blocks: ${blkErr.message}`);

    const { data: officeBlocks, error: obErr } = await supabase
      .from("office_hour_blocks")
      .select("instructor_id, date, time_start, time_end")
      .gte("date", effFrom)
      .lte("date", date_to);
    if (obErr) throw new Error(`office_hour_blocks: ${obErr.message}`);

    // Build per-date busy intervals per instructor
    const busy = new Map<string, Map<string, [number, number][]>>(); // date -> instructor -> intervals
    const addBusy = (date: string, instructorId: string | null, s: number, e: number) => {
      if (!instructorId || !Number.isFinite(s) || !Number.isFinite(e) || e <= s) return;
      if (!busy.has(date)) busy.set(date, new Map());
      const m = busy.get(date)!;
      if (!m.has(instructorId)) m.set(instructorId, []);
      m.get(instructorId)!.push([s, e]);
    };

    for (const it of items ?? []) {
      const ticketStatus = (it as any).tickets?.status as string | undefined;
      if (ticketStatus && NON_BLOCKING_TICKET_STATUS.has(ticketStatus)) continue;
      if (it.status && NON_BLOCKING_ITEM_STATUS.has(it.status)) continue;
      if (!it.time_start || !it.time_end) continue;
      addBusy(it.date, it.instructor_id, toMin(it.time_start), toMin(it.time_end));
    }
    for (const gi of groupInstances ?? []) {
      if (gi.status && NON_BLOCKING_ITEM_STATUS.has(gi.status)) continue;
      if (!gi.start_time || !gi.end_time) continue;
      addBusy(gi.date, gi.instructor_id, toMin(gi.start_time), toMin(gi.end_time));
      addBusy(gi.date, gi.assistant_instructor_id, toMin(gi.start_time), toMin(gi.end_time));
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
    for (const ob of officeBlocks ?? []) {
      if (!ob.time_start || !ob.time_end) continue;
      addBusy(ob.date, ob.instructor_id, toMin(ob.time_start), toMin(ob.time_end));
    }

    // Build day list
    const days: any[] = [];
    for (let d = effFrom; d <= date_to; d = nextDate(d)) {
      const dayBusy = busy.get(d) ?? new Map<string, [number, number][]>();
      const slots: any[] = [];
      for (let start = OPEN_MIN; start + duration_minutes <= CLOSE_MIN; start += STEP_MIN) {
        const end = start + duration_minutes;
        const freeInstructors = instructorIds.filter((id) => {
          const intervals = dayBusy.get(id) ?? [];
          return !intervals.some(([s, e]) => s < end && e > start);
        });
        if (freeInstructors.length === 0 && !include_unavailable) continue;
        slots.push({
          start: toHHMM(start),
          end: toHHMM(end),
          available: freeInstructors.length > 0,
          free_instructors: freeInstructors.length,
          available_instructor_ids: freeInstructors,
        });
      }
      const weekday = new Date(d + "T12:00:00Z").getUTCDay(); // 0=Sun..6=Sat
      days.push({
        date: d,
        weekday,
        is_saturday: weekday === 6,
        is_weekday: weekday >= 1 && weekday <= 5,
        fully_booked: slots.every((s) => !s.available),
        slots,
      });
    }

    return json({
      success: true,
      timezone: "Europe/Zurich",
      open: "09:00",
      close: "16:00",
      total_instructors: instructorIds.length,
      days,
    });
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
