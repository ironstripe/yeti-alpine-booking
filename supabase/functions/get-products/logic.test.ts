import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { eligibleProducts, resolveCurrentSeason } from "./logic.ts";

const s1 = { id: "s1", name: "Winter 26/27", start_date: "2026-12-01", end_date: "2027-04-15" };
const s2 = { id: "s2", name: "Overlap", start_date: "2027-01-01", end_date: "2027-02-01" };

Deno.test("query error fails closed", () => {
  assertEquals(resolveCurrentSeason(null, { message: "boom" }, "2027-01-10"), { ok: false, code: "season_query_failed", status: 503 });
  assertEquals(resolveCurrentSeason(undefined, null, "2027-01-10").ok, false);
});

Deno.test("missing season fails closed", () => {
  assertEquals(resolveCurrentSeason([s1], null, "2026-10-03"), { ok: false, code: "no_current_season", status: 503 });
  assertEquals(resolveCurrentSeason([], null, "2027-01-10").ok, false);
});

Deno.test("overlapping seasons fail closed", () => {
  assertEquals(resolveCurrentSeason([s1, s2], null, "2027-01-10"), { ok: false, code: "ambiguous_season", status: 503 });
});

Deno.test("single covering season resolves (inclusive bounds)", () => {
  assertEquals(resolveCurrentSeason([s1, s2], null, "2026-12-01"), { ok: true, season: s1 });
  assertEquals(resolveCurrentSeason([s1], null, "2027-04-15"), { ok: true, season: s1 });
});

Deno.test("only active, website-visible products of the season are eligible", () => {
  const rows = [
    { id: "ok", season_id: "s1", is_active: true, show_on_website: true },
    { id: "hidden", season_id: "s1", is_active: true, show_on_website: false },
    { id: "office", season_id: "s1", is_active: true, show_on_website: null },
    { id: "inactive", season_id: "s1", is_active: false, show_on_website: true },
    { id: "other", season_id: "s2", is_active: true, show_on_website: true },
  ];
  assertEquals(eligibleProducts(rows, "s1").map((p) => p.id), ["ok"]);
  assertEquals(eligibleProducts(null, "s1"), []);
});

Deno.test("office_shift is never eligible, even active and explicitly website-visible", () => {
  const rows = [
    { id: "ok", season_id: "s1", is_active: true, show_on_website: true, type: "group" },
    { id: "office-visible", season_id: "s1", is_active: true, show_on_website: true, type: "office_shift" },
  ];
  assertEquals(eligibleProducts(rows, "s1").map((p) => p.id), ["ok"]);
});
