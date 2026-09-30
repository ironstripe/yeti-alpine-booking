// Contract test for the deployed `private-appointments` endpoint. Synthetic input only; never writes data.
// Run: deno test --allow-net --allow-env supabase/functions/private-appointments/contract.test.ts
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
