// Pure schema/status tests for the `office-booking` contract (no network, no writes):
//   deno test --node-modules-dir=none --allow-env --allow-read supabase/functions/office-booking/contract.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OfficeBookingRequest, officePublicBody, officeStatusFor } from "../_shared/officeBookingContract.ts";

const u = () => crypto.randomUUID();
const cart = () => ({
  submission_key: "b07a-key-0001", customer_id: u(),
  participants: [{ ref: "a", participant_id: u() }, { ref: "g", guest: { first_name: "Gast", birth_date: "2016-01-01" } }],
  items: [
    { kind: "private", product_id: u(), participants: ["a", "g"], appointments: [{ date: "2027-01-04", time_start: "10:00", time_end: "12:00", instructor_id: u() },
      { date: "2027-01-04", time_start: "14:00", time_end: "16:00", assign_later: true, participants: ["a"] }] },
    { kind: "group", lines: [{ participant: "g", course_id: u(), product_id: u(), dates: ["2027-01-04"], lunch_dates: ["2027-01-04"] }] },
  ],
});

Deno.test("schema: quote and create shapes", () => {
  assert(OfficeBookingRequest.safeParse({ action: "quote", ...cart() }).success);
  assert(OfficeBookingRequest.safeParse({ action: "create", ...cart(), confirmation_requested: false, acknowledged_quote_digest: "a".repeat(32) }).success);
});
Deno.test("schema: create needs digest + explicit confirmation choice", () => {
  assert(!OfficeBookingRequest.safeParse({ action: "create", ...cart(), acknowledged_quote_digest: "a".repeat(32) }).success);
  assert(!OfficeBookingRequest.safeParse({ action: "create", ...cart(), confirmation_requested: true }).success);
});
Deno.test("schema: identity only via refs (no inline guest/participant_id on group lines), no teacher+later", () => {
  const c = cart(); (c.items[1] as any).lines[0].participant_id = u();
  assert(!OfficeBookingRequest.safeParse({ action: "quote", ...c }).success);
  const d = cart(); (d.items[0] as any).appointments[0].assign_later = true;
  assert(!OfficeBookingRequest.safeParse({ action: "quote", ...d }).success);
});
Deno.test("schema: future guest birth date rejected (B08)", () => {
  const c = cart(); (c.participants[1] as any).guest.birth_date = "2999-01-01";
  assert(!OfficeBookingRequest.safeParse({ action: "quote", ...c }).success);
});
Deno.test("status/body: errors are whitelisted and positioned", () => {
  assertEquals(officeStatusFor({ error: "submission_mismatch" }), 409);
  assertEquals(officePublicBody({ error: "invalid", field: "meeting_point", item: 1, index: 0, line: "0", secret: "x" }),
    { error: "invalid", field: "meeting_point", ref: null, item: 1, index: 0 });
  assertEquals(officeStatusFor({ error: "weird" }), 500);
  assertEquals(officePublicBody({ ok: true, ticket_id: "t" }), { ticket_id: "t" });
});
