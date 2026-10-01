// Synthetic-only. Run: deno test --no-check supabase/functions/instructor-import-apply/diff.test.ts
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { diffEqual } from "../_shared/bcImport/apply.ts";

const cls = [
  { field: "phone", source: "+41 79 000 00 01", yeti: null },
  { field: "email", source: "a@example.test", yeti: "b@example.test" },
];
// What PostgreSQL jsonb::text returns after round-trip (keys reordered).
const staged = JSON.parse('[{"yeti":null,"field":"phone","source":"+41 79 000 00 01"},{"yeti":"b@example.test","field":"email","source":"a@example.test"}]');

Deno.test("jsonb key permutation compares equal", () => assert(diffEqual(cls, staged)));
Deno.test("empty / null diffs", () => { assert(diffEqual([], [])); assert(!diffEqual([], cls)); });
Deno.test("changed source is unequal", () => assert(!diffEqual(cls, [{ ...cls[0], source: "+41 79 000 00 02" }, cls[1]])));
Deno.test("changed yeti value is unequal", () => assert(!diffEqual(cls, [cls[0], { ...cls[1], yeti: "c@example.test" }])));
Deno.test("null vs empty string vs missing is unequal", () => {
  assert(!diffEqual(cls, [{ ...cls[0], yeti: "" }, cls[1]]));
  assert(!diffEqual(cls, [{ field: "phone", source: "+41 79 000 00 01" }, cls[1]]));
});
Deno.test("changed field name is unequal", () => assert(!diffEqual(cls, [{ ...cls[0], field: "city" }, cls[1]])));
Deno.test("item order matters", () => assert(!diffEqual(cls, [cls[1], cls[0]])));
