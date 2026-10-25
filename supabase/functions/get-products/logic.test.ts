import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { eligibleProducts, resolveCurrentSeason, tariffPricedIds } from "./logic.ts";

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
    { id: "ok", season_id: "s1", type: "group", is_active: true, show_on_website: true },
    { id: "hidden", season_id: "s1", type: "group", is_active: true, show_on_website: false },
    { id: "office", season_id: "s1", type: "office_shift", is_active: true, show_on_website: true },
    { id: "inactive", season_id: "s1", type: "group", is_active: false, show_on_website: true },
    { id: "other", season_id: "s2", type: "group", is_active: true, show_on_website: true },
  ];
  assertEquals(eligibleProducts(rows, "s1").map((p) => p.id), ["ok"]);
  assertEquals(eligibleProducts(null, "s1"), []);
});

Deno.test("B07: activating a tariff-priced private product does not add it to get-products", () => {
  const SKI = "3646f155-8a66-53e3-b512-749f3a42c1ae";
  const before = [{ id: "g", season_id: "s1", type: "group", is_active: true, show_on_website: true },
    { id: SKI, season_id: "s1", type: "private", is_active: false, show_on_website: true }];
  const after = before.map((p) => ({ ...p, is_active: true }));
  const t = tariffPricedIds([{ product_id: SKI }], null);
  assertEquals(t.ok, true);
  const ids = t.ok ? t.ids : new Set<string>();
  assertEquals(eligibleProducts(before, "s1", ids).map((p) => p.id), ["g"]);
  assertEquals(eligibleProducts(after, "s1", ids).map((p) => p.id), ["g"]);
  // legacy private product without tariff revision keeps its previous behaviour
  assertEquals(eligibleProducts([{ id: "old", season_id: "s1", type: "private", is_active: true, show_on_website: true }], "s1", ids).map((p) => p.id), ["old"]);
});
Deno.test("tariff state: not installed => none; other error => fail closed", () => {
  assertEquals(tariffPricedIds(null, { code: "PGRST205" }), { ok: true, ids: new Set() });
  assertEquals(tariffPricedIds(null, { code: "42P01" }), { ok: true, ids: new Set() });
  assertEquals(tariffPricedIds(null, { code: "42501" }), { ok: false });
});
