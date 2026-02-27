import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AvailabilityRequest {
  instructorName: string;
  requestedDates: string[];
  requestedTime?: { start: string; end: string };
  isFlexible: boolean;
  requestedSpecialization?: string;
}

interface SlotInfo {
  date: string;
  start: string;
  end: string;
}

// Generate 1h slots from 09:00 to 16:00
function generateDaySlots(): { start: string; end: string }[] {
  const slots: { start: string; end: string }[] = [];
  for (let h = 9; h < 16; h++) {
    slots.push({
      start: `${h.toString().padStart(2, "0")}:00`,
      end: `${(h + 1).toString().padStart(2, "0")}:00`,
    });
  }
  return slots;
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && e1 > s2;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: AvailabilityRequest = await req.json();
    const { instructorName, requestedDates, requestedTime, isFlexible, requestedSpecialization } = body;

    console.log("check-instructor-availability called:", JSON.stringify(body));

    if (!instructorName) {
      return new Response(
        JSON.stringify({ status: "error", message: "instructorName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Find instructor by first name
    const { data: instructors, error: instrError } = await supabase
      .from("instructors")
      .select("id, first_name, last_name, specialization, languages")
      .eq("status", "active")
      .ilike("first_name", instructorName);

    if (instrError) {
      console.error("Error finding instructor:", instrError);
      throw instrError;
    }

    if (!instructors || instructors.length === 0) {
      return new Response(
        JSON.stringify({ status: "not_found", instructorName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (instructors.length > 1) {
      return new Response(
        JSON.stringify({
          status: "ambiguous",
          instructorName,
          matches: instructors.map((i) => ({
            id: i.id,
            first_name: i.first_name,
            last_name: i.last_name,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instructor = instructors[0];
    const instructorId = instructor.id;
    console.log(`Found instructor: ${instructor.first_name} ${instructor.last_name} (${instructorId})`);

    if (!requestedDates || requestedDates.length === 0) {
      return new Response(
        JSON.stringify({
          status: "available",
          instructor: { first_name: instructor.first_name, last_name: instructor.last_name },
          message: "No specific dates requested",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check conflicts for each requested date
    // Fetch all relevant data in parallel
    const [ticketItemsRes, groupInstancesRes, absencesRes] = await Promise.all([
      supabase
        .from("ticket_items")
        .select("id, date, time_start, time_end")
        .eq("instructor_id", instructorId)
        .in("date", requestedDates)
        .neq("status", "cancelled")
        .neq("status", "storno"),
      supabase
        .from("group_course_instances")
        .select("id, date, start_time, end_time")
        .eq("instructor_id", instructorId)
        .in("date", requestedDates)
        .neq("status", "cancelled"),
      supabase
        .from("instructor_absences")
        .select("id, start_date, end_date, is_full_day, time_start, time_end")
        .eq("instructor_id", instructorId)
        .eq("status", "confirmed")
        .lte("start_date", requestedDates[requestedDates.length - 1])
        .gte("end_date", requestedDates[0]),
    ]);

    const ticketItems = ticketItemsRes.data || [];
    const groupInstances = groupInstancesRes.data || [];
    const absences = absencesRes.data || [];

    // 3. For each date, compute free slots
    const perDateResults: Record<string, SlotInfo[]> = {};

    for (const date of requestedDates) {
      const daySlots = generateDaySlots();

      // Filter out occupied slots
      const freeSlots = daySlots.filter((slot) => {
        // Check absences
        for (const absence of absences) {
          if (date >= absence.start_date && date <= absence.end_date) {
            if (absence.is_full_day !== false) return false; // full-day absence
            if (absence.time_start && absence.time_end) {
              if (timesOverlap(slot.start, slot.end, absence.time_start, absence.time_end)) {
                return false;
              }
            }
          }
        }

        // Check ticket_items
        for (const ti of ticketItems) {
          if (ti.date === date && ti.time_start && ti.time_end) {
            if (timesOverlap(slot.start, slot.end, ti.time_start, ti.time_end)) {
              return false;
            }
          }
        }

        // Check group instances
        for (const gi of groupInstances) {
          if (gi.date === date && gi.start_time && gi.end_time) {
            if (timesOverlap(slot.start, slot.end, gi.start_time, gi.end_time)) {
              return false;
            }
          }
        }

        return true;
      });

      perDateResults[date] = freeSlots.map((s) => ({ date, start: s.start, end: s.end }));
    }

    // 4. Build response based on scenario
    const allFreeSlots = Object.values(perDateResults).flat();
    const fullyBookedDates = requestedDates.filter((d) => perDateResults[d].length === 0);
    const instructorInfo = { first_name: instructor.first_name, last_name: instructor.last_name };

    // Case A: Specific time requested
    if (requestedTime) {
      const requestedSlotFree = requestedDates.every((date) =>
        perDateResults[date].some(
          (slot) => timesOverlap(slot.start, slot.end, requestedTime.start, requestedTime.end)
        )
      );

      if (requestedSlotFree) {
        return new Response(
          JSON.stringify({ status: "available", instructor: instructorInfo }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Slot not free – are there other slots?
      if (allFreeSlots.length > 0) {
        return new Response(
          JSON.stringify({
            status: "unavailable_slot",
            instructor: instructorInfo,
            free_slots: perDateResults,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fully booked – find alternatives if flexible
      if (isFlexible) {
        const alternatives = await findAlternativeInstructors(
          supabase, instructorId, requestedDates, requestedTime, requestedSpecialization
        );
        if (alternatives.length > 0) {
          return new Response(
            JSON.stringify({
              status: "alternatives_found",
              instructor: instructorInfo,
              alternatives,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ status: "fully_booked", instructor: instructorInfo }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Case B: No specific time – return free slots list
    if (fullyBookedDates.length === requestedDates.length) {
      // All dates fully booked
      if (isFlexible) {
        const alternatives = await findAlternativeInstructors(
          supabase, instructorId, requestedDates, undefined, requestedSpecialization
        );
        if (alternatives.length > 0) {
          return new Response(
            JSON.stringify({
              status: "alternatives_found",
              instructor: instructorInfo,
              alternatives,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ status: "fully_booked", instructor: instructorInfo }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (allFreeSlots.length > 0) {
      return new Response(
        JSON.stringify({
          status: "free_slots_list",
          instructor: instructorInfo,
          free_slots: perDateResults,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ status: "fully_booked", instructor: instructorInfo }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in check-instructor-availability:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function findAlternativeInstructors(
  supabase: any,
  excludeInstructorId: string,
  dates: string[],
  requestedTime?: { start: string; end: string },
  specialization?: string
): Promise<Array<{ first_name: string; last_name: string }>> {
  // Get all active instructors except the requested one
  let query = supabase
    .from("instructors")
    .select("id, first_name, last_name, specialization")
    .eq("status", "active")
    .neq("id", excludeInstructorId);

  if (specialization && specialization !== "both") {
    query = query.or(`specialization.eq.${specialization},specialization.eq.both`);
  }

  const { data: candidates } = await query.limit(10);
  if (!candidates || candidates.length === 0) return [];

  const available: Array<{ first_name: string; last_name: string }> = [];

  for (const candidate of candidates) {
    let isFree = true;

    // Check ticket_items
    const { data: ti } = await supabase
      .from("ticket_items")
      .select("id, date, time_start, time_end")
      .eq("instructor_id", candidate.id)
      .in("date", dates)
      .neq("status", "cancelled")
      .neq("status", "storno");

    // Check group instances
    const { data: gi } = await supabase
      .from("group_course_instances")
      .select("id, date, start_time, end_time")
      .eq("instructor_id", candidate.id)
      .in("date", dates)
      .neq("status", "cancelled");

    // Check absences
    const { data: abs } = await supabase
      .from("instructor_absences")
      .select("id, start_date, end_date, is_full_day, time_start, time_end")
      .eq("instructor_id", candidate.id)
      .eq("status", "confirmed")
      .lte("start_date", dates[dates.length - 1])
      .gte("end_date", dates[0]);

    for (const date of dates) {
      // Check absences for this date
      const hasAbsence = (abs || []).some((a: any) => {
        if (date < a.start_date || date > a.end_date) return false;
        if (a.is_full_day !== false) return true;
        if (!requestedTime || !a.time_start || !a.time_end) return true;
        return timesOverlap(requestedTime.start, requestedTime.end, a.time_start, a.time_end);
      });
      if (hasAbsence) { isFree = false; break; }

      if (requestedTime) {
        const hasConflict = (ti || []).some((t: any) =>
          t.date === date && t.time_start && t.time_end &&
          timesOverlap(requestedTime.start, requestedTime.end, t.time_start, t.time_end)
        ) || (gi || []).some((g: any) =>
          g.date === date && g.start_time && g.end_time &&
          timesOverlap(requestedTime.start, requestedTime.end, g.start_time, g.end_time)
        );
        if (hasConflict) { isFree = false; break; }
      } else {
        // Without specific time, check if entire day is blocked
        const daySlots = generateDaySlots();
        const freeCount = daySlots.filter((slot) => {
          const blocked = (ti || []).some((t: any) =>
            t.date === date && t.time_start && t.time_end &&
            timesOverlap(slot.start, slot.end, t.time_start, t.time_end)
          ) || (gi || []).some((g: any) =>
            g.date === date && g.start_time && g.end_time &&
            timesOverlap(slot.start, slot.end, g.start_time, g.end_time)
          );
          return !blocked;
        }).length;
        if (freeCount === 0) { isFree = false; break; }
      }
    }

    if (isFree) {
      available.push({ first_name: candidate.first_name, last_name: candidate.last_name });
      if (available.length >= 3) break;
    }
  }

  return available;
}
