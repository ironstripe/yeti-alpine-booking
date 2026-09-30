// Snapshot parity: the frontend calculatePrivateLessonPrice vs. a CACHED JSON fixture of
// pa_price outputs captured once from the database. This test does NOT execute SQL and uses
// hard-coded rates; it cannot prove live SQL/UI parity on its own. Live pa_price behaviour is
// asserted in supabase/tests/private_appointments_phase1_test.sql (section 0).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { calculatePrivateLessonPrice } from "../../../src/lib/pricing/private-lesson-pricing.ts";

const fixtureUrl = new URL("../../tests/private_price_fixture.json", import.meta.url);
const fixture = JSON.parse(await Deno.readTextFile(fixtureUrl));

// Same rates as public.private_lesson_rates at fixture generation time
const rates = [
  { start_time: "09:00", end_time: "10:00", rate_per_hour: 75, is_peak: false },
  { start_time: "10:00", end_time: "12:00", rate_per_hour: 85, is_peak: true },
  { start_time: "12:00", end_time: "14:00", rate_per_hour: 75, is_peak: false },
  { start_time: "14:00", end_time: "16:00", rate_per_hour: 85, is_peak: true },
];
const highSeason = [{ name: "Weihnachten", start_date: "2026-12-23", end_date: "2027-01-05" }];

Deno.test("pa_price parity with calculatePrivateLessonPrice (full grid)", () => {
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  let i = 0;
  const mismatches: string[] = [];
  for (const d of fixture.grid.dates as string[]) {
    for (let s = 8; s <= 16; s++) {
      for (let e = 9; e <= 17; e++) {
        if (e <= s) continue;
        for (let p = 1; p <= 5; p++) {
          const ts = calculatePrivateLessonPrice(new Date(d), pad(s), pad(e), p, rates, highSeason).totalPrice;
          const sql = fixture.prices[i++];
          if (ts !== sql) mismatches.push(`${d} ${pad(s)}-${pad(e)} x${p}: ts=${ts} sql=${sql}`);
        }
      }
    }
  }
  assertEquals(i, fixture.prices.length, "grid size must match fixture");
  assertEquals(mismatches, []);
});
