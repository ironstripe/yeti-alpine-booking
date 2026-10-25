// B08: server contract rejects tampered/invalid new-person birth dates before any RPC.
import { RequestSchema } from "./privateAppointmentsContract.ts";
import { birthDateIssue, schoolToday } from "./birthDate.ts";
const U = "00000000-0000-4000-8000-000000000001";
const ok = (b: boolean, m: string) => { if (!b) throw new Error(m); };
const create = (birth_date: string) => ({ action: "create", submission_key: "abcdefgh", customer_id: U, product_id: U,
  appointments: [{ date: "2026-12-14", time_start: "09:00", time_end: "10:00", assign_later: true }],
  participants: [{ participant_id: U }, { guest_key: "guest-abcdefgh", first_name: "Neu", birth_date }] });
Deno.test("private create: future/impossible guest DOB rejected, today/past accepted, existing participant unaffected", () => {
  const today = schoolToday();
  const [y, m, d] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  ok(RequestSchema.safeParse(create(today)).success, "today");
  ok(RequestSchema.safeParse(create("2015-05-05")).success, "past");
  ok(!RequestSchema.safeParse(create(tomorrow)).success, "tomorrow");
  ok(!RequestSchema.safeParse(create("2999-01-01")).success, "far future");
  ok(!RequestSchema.safeParse(create("2027-02-30")).success, "Feb 30");
});
Deno.test("runtime timezone does not shift the school date", () => {
  ok(schoolToday(new Date("2026-03-28T23:30:00Z")) === "2026-03-29", "CET midnight");
  ok(schoolToday(new Date("2026-07-01T22:30:00Z")) === "2026-07-02", "CEST midnight");
  ok(birthDateIssue("2026-07-02", new Date("2026-07-01T22:30:00Z")) === null, "today in Zurich");
});
