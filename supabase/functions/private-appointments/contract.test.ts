// Contract test for the deployed `private-appointments` endpoint. Synthetic input only; never writes data.
// Run (pure schema tests only, from any dir):
//   deno test --node-modules-dir=none --no-check --allow-net --allow-env --filter schema supabase/functions/private-appointments/contract.test.ts
// Run all (incl. live checks): deno test --allow-net --allow-env supabase/functions/private-appointments/contract.test.ts
// Needs SUPABASE_URL + SUPABASE_ANON_KEY. Optional role tokens: PA_TEACHER_JWT, PA_NOROLE_JWT, PA_OFFICE_JWT.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { publicBody, RequestSchema, statusFor } from "../_shared/privateAppointmentsContract.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const fn = `${URL_}/functions/v1/private-appointments`;
const call = (headers: Record<string, string>, body: unknown) =>
  fetch(fn, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const validMove = {
  action: "move", appointment_id: crypto.randomUUID(), date: "2030-01-10",
  time_start: "10:00", time_end: "11:00", instructor_id: crypto.randomUUID(),
};

Deno.test("schema: accepts documented shapes, rejects others", () => {
  assert(RequestSchema.safeParse(validMove).success);
  assert(!RequestSchema.safeParse({ ...validMove, action: "delete" }).success);
  assert(!RequestSchema.safeParse({ action: "create", submission_key: "short" }).success);
  assert(!RequestSchema.safeParse({ action: "period_update", period_group_id: crypto.randomUUID(), changes: {} }).success);
});

Deno.test("schema: create slots need a teacher or explicit assign_later intent", () => {
  const base = { action: "create", submission_key: "schema-key-0001", customer_id: crypto.randomUUID(), product_id: crypto.randomUUID(),
    participants: [{ participant_id: crypto.randomUUID() }] };
  const t = { date: "2030-01-10", time_start: "12:00", time_end: "14:00" };
  const ok = (a: unknown[]) => RequestSchema.safeParse({ ...base, appointments: a }).success;
  assert(ok([{ ...t, instructor_id: crypto.randomUUID() }]));
  assert(ok([{ ...t, assign_later: true }]));
  assert(ok([{ ...t, instructor_id: crypto.randomUUID() }, { ...t, assign_later: true }]));
  assert(!ok([t]));
  assert(!ok([{ ...t, assign_later: false }]));
  assert(!ok([{ ...t, assign_later: "true" }]));
  assert(!ok([{ ...t, instructor_id: null }]));
  assert(!ok([{ ...t, instructor_id: crypto.randomUUID(), assign_later: true }]));
  assert(!RequestSchema.safeParse({ ...validMove, instructor_id: undefined }).success); // assignment always needs a teacher
});

Deno.test("status + body mapping never leaks internals", () => {
  assertEquals(statusFor({ ok: true }), 200);
  assertEquals(statusFor({ error: "conflict" }), 409);
  assertEquals(statusFor({ error: "protected" }), 423);
  assertEquals(statusFor({ error: "not_found" }), 404);
  assertEquals(statusFor({ error: "whatever" }), 500);
  assertEquals(publicBody({ error: "boom", detail: "SQL secret" }), { error: "internal_error" });
  assertEquals(publicBody({ error: "not_found", field: "customer_id" }), { error: "not_found" });
});

Deno.test({ name: "live: no session -> 401", ignore: !URL_, fn: async () => {
  const r = await call({}, validMove); await r.body?.cancel(); assertEquals(r.status, 401);
}});
Deno.test({ name: "live: public key only -> 401", ignore: !URL_ || !ANON, fn: async () => {
  const r = await call({ Authorization: `Bearer ${ANON}`, apikey: ANON! }, validMove); await r.body?.cancel(); assertEquals(r.status, 401);
}});
for (const [name, env] of [["teacher", "PA_TEACHER_JWT"], ["no-role", "PA_NOROLE_JWT"]]) {
  const jwt = Deno.env.get(env);
  Deno.test({ name: `live: ${name} -> 403`, ignore: !URL_ || !jwt, fn: async () => {
    const r = await call({ Authorization: `Bearer ${jwt}` }, validMove); await r.body?.cancel(); assertEquals(r.status, 403);
  }});
}
const office = Deno.env.get("PA_OFFICE_JWT");
Deno.test({ name: "live: office invalid input -> 400, unknown id -> 404", ignore: !URL_ || !office, fn: async () => {
  const bad = await call({ Authorization: `Bearer ${office}` }, { action: "move" });
  assertEquals(bad.status, 400); assertEquals((await bad.json()).error, "invalid");
  const nf = await call({ Authorization: `Bearer ${office}` }, validMove);
  assertEquals(nf.status, 404); assertEquals(await nf.json(), { error: "not_found" });
}});
for (const f of ["pa_create_booking", "pa_move_appointment", "pa_period_update", "pa_confirm_appointment"]) {
  Deno.test({ name: `live: browser key cannot call ${f}`, ignore: !URL_ || !ANON, fn: async () => {
    const r = await fetch(`${URL_}/rest/v1/rpc/${f}`, {
      method: "POST", headers: { apikey: ANON!, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }, body: "{}",
    });
    await r.body?.cancel();
    assert(r.status === 401 || r.status === 403 || r.status === 404, `${f} returned ${r.status}`);
  }});
}

const validCreate = {
  action: "create", submission_key: "disc-test-0001", customer_id: crypto.randomUUID(), product_id: crypto.randomUUID(),
  appointments: [{ date: "2030-01-10", time_start: "10:00", time_end: "12:00", instructor_id: crypto.randomUUID() }],
  participants: [{ participant_id: crypto.randomUUID() }],
};
Deno.test("schema: manual discount on create", () => {
  assert(RequestSchema.safeParse(validCreate).success, "no discount");
  assert(RequestSchema.safeParse({ ...validCreate, discount_percent: 0 }).success, "zero without reason");
  // DB normalizes the reason to null for 0%; the schema only accepts it.
  assert(RequestSchema.safeParse({ ...validCreate, discount_percent: 0, discount_reason: "Versehen" }).success, "zero with reason");
  assert(RequestSchema.safeParse({ ...validCreate, discount_percent: 10, discount_reason: "Stammkunde" }).success, "10% with reason");
  assert(RequestSchema.safeParse({ ...validCreate, discount_percent: 100, discount_reason: "Gutschrift" }).success, "100%");
  assert(!RequestSchema.safeParse({ ...validCreate, discount_percent: 10 }).success, "missing reason");
  assert(!RequestSchema.safeParse({ ...validCreate, discount_percent: 10, discount_reason: "   " }).success, "blank reason");
  assert(!RequestSchema.safeParse({ ...validCreate, discount_percent: -1, discount_reason: "x" }).success, "negative");
  assert(!RequestSchema.safeParse({ ...validCreate, discount_percent: 100.5, discount_reason: "x" }).success, ">100");
  assert(!RequestSchema.safeParse({ ...validCreate, discount_percent: Infinity, discount_reason: "x" }).success, "infinite");
  assert(!RequestSchema.safeParse({ ...validCreate, discount_percent: NaN, discount_reason: "x" }).success, "NaN");
  assert(!RequestSchema.safeParse({ ...validCreate, discount_percent: "10", discount_reason: "x" }).success, "string");
  assert(!RequestSchema.safeParse({ ...validCreate, discount_percent: 10, discount_reason: "x".repeat(501) }).success, "long reason");
  const trimmed = RequestSchema.safeParse({ ...validCreate, discount_percent: 10, discount_reason: "  Stammkunde " });
  assert(trimmed.success && trimmed.data.action === "create" && trimmed.data.discount_reason === "Stammkunde", "trimmed");
});
