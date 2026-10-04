// Real SQL tests for supabase/pending/pa_assign_later.sql ("Später zuweisen" private lessons).
// Throwaway local PostgreSQL only: schema-only production baseline + pending SQL + synthetic data.
//   PA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/paAssignLater.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.PA_TEST_DATABASE_URL ?? process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `pa_assign_later_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);

let passed = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); passed++; results.push(`ok   ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), PRIV = id(0xd1), CUST = id(0xc1), OTHER_CUST = id(0xc2), P1 = id(0xa1), P2 = id(0xa2), P_FOREIGN = id(0xa9);
const I1 = id(0xf001), I2 = id(0xf002), ACTOR = id(0xbeef);
const D1 = '2026-12-21', D2 = '2026-12-22', D3 = '2026-12-23';

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', ...(process.env.PA_BASELINE_ONLY ? [] : ['supabase/pending/pa_assign_later.sql'])]) {
    const r = spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL(f, root))],
      { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });
    if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }
  // Business "today" pinned before the synthetic dates.
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-04' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES ('${PRIV}','Privat Ski 2h','private',120,0,'${S}',true);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ('${I1}','A','Eins','active','{ski}'),('${I2}','B','Zwei','active','{ski}');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('08:00','17:00',80);
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid'),('${OTHER_CUST}','Other','Kunde','o@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES
      ('${P1}','${CUST}','Lea','Synth','2016-02-02'),('${P2}','${CUST}','Tom','Synth','2014-03-03'),('${P_FOREIGN}','${OTHER_CUST}','X','Y','2015-01-01');
  `);

  let k = 0;
  const key = () => `pa-later-${++k}-${Date.now()}`;
  const later = (date, start = '12:00', end = '14:00') => ({ date, time_start: start, time_end: end, assign_later: true });
  const withT = (date, ins, start = '12:00', end = '14:00') => ({ date, time_start: start, time_end: end, instructor_id: ins });
  const create = async (appointments, extra = {}) => (await sql`SELECT pa_create_booking(${sql.json({
    submission_key: extra.submission_key ?? key(), customer_id: CUST, product_id: PRIV,
    appointments, participants: extra.participants ?? [{ participant_id: P1 }], ...extra.more,
  })}, ${ACTOR}) r`)[0].r;
  const move = async (aid, date, s, e, ins) => (await sql`SELECT pa_move_appointment(${aid}, ${date}, ${s}, ${e}, ${ins}, ${ACTOR}) r`)[0].r;
  const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) t, (SELECT count(*)::int FROM ticket_items) i,
      (SELECT count(*)::int FROM private_appointments) a, (SELECT count(*)::int FROM private_appointment_participants) m,
      (SELECT count(*)::int FROM action_tasks) task, (SELECT count(*)::int FROM instructor_notification_queue) nq`)[0];
  const appt = async (aid) => (await sql`SELECT a.*, ti.instructor_id ti_instr, ti.instructor_confirmation ti_conf, ti.unit_price ti_price,
      ti.confirmation_reset_at, ti.participant_id ti_participant FROM private_appointments a JOIN ticket_items ti ON ti.appointment_id=a.id WHERE a.id=${aid}`)[0];

  await t('privileges: anon/authenticated cannot execute pa_create_booking / pa_apply_slot', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const f of ['pa_create_booking(jsonb, uuid)', 'pa_apply_slot(uuid, date, time, time, uuid)']) {
        const [{ ok }] = await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`;
        assert.equal(ok, false, `${role} ${f}`);
      }
    }
    const [{ ok }] = await sql`SELECT has_function_privilege('service_role', 'public.pa_create_booking(jsonb, uuid)', 'EXECUTE') ok`;
    assert.equal(ok, true);
  });

  let single;
  await t('unassigned single date 12–14: NULL teacher, exact time, server price, NULL confirmation, linkage', async () => {
    const before = await counts();
    single = await create([later(D1)]);
    assert.equal(single.ok, true, JSON.stringify(single));
    const a = await appt(single.appointment_ids[0]);
    assert.equal(a.instructor_id, null); assert.equal(a.ti_instr, null);
    assert.equal(a.instructor_confirmation, null); assert.equal(a.ti_conf, null);
    assert.equal(String(a.date.toISOString?.() ?? a.date).slice(0, 10), D1);
    assert.equal(a.time_start, '12:00:00'); assert.equal(a.time_end, '14:00:00');
    const [{ p }] = await sql`SELECT pa_price(${D1}, '12:00', '14:00', 1) p`;
    assert.equal(Number(p), 160); assert.equal(Number(a.price), 160); assert.equal(Number(a.ti_price), 160);
    assert.equal(Number(single.total), 160);
    assert.equal(a.ti_participant, null); // one commercial line per appointment
    const after = await counts();
    assert.deepEqual([after.t - before.t, after.a - before.a, after.i - before.i, after.m - before.m, after.task - before.task, after.nq - before.nq], [1, 1, 1, 1, 1, 0]);
    const [task] = await sql`SELECT * FROM action_tasks WHERE related_ticket_id=${single.ticket_id}`;
    assert.equal(task.task_type, 'assign_instructor'); assert.equal(task.priority, 'high'); assert.equal(task.created_by, ACTOR);
    const [h] = await sql`SELECT details FROM ticket_history WHERE ticket_id=${single.ticket_id} AND event_type='PRIVATE_APPOINTMENT_CHANGED'`;
    assert.equal(h.details.change, 'created'); assert.equal(h.details.unassigned, 1);
    const [{ n }] = await sql`SELECT count(*)::int n FROM ticket_items WHERE instructor_id IS NULL AND status<>'cancelled' AND date >= '2026-10-04' AND ticket_id=${single.ticket_id}`;
    assert.equal(n, 1); // dashboard "Lehrperson fehlt" query finds it
  });

  await t('idempotent replay of the same submission writes nothing', async () => {
    const sk = key();
    const r1 = await create([later(D2)], { submission_key: sk });
    const before = await counts();
    const r2 = await create([later(D2)], { submission_key: sk });
    assert.equal(r2.replayed, true); assert.equal(r2.ticket_id, r1.ticket_id);
    assert.deepEqual(r2.appointment_ids, r1.appointment_ids);
    assert.deepEqual(await counts(), before);
  });

  let multi;
  await t('multi-date unassigned (3 dates, 2 participants): one appointment+line each, period group, one task', async () => {
    multi = await create([later(D1), later(D2), later(D3)], { participants: [{ participant_id: P1 }, { participant_id: P2 }] });
    assert.equal(multi.ok, true, JSON.stringify(multi));
    const rows = await sql`SELECT a.id, a.instructor_id, a.period_group_id, a.price, (SELECT count(*)::int FROM private_appointment_participants m WHERE m.appointment_id=a.id) persons,
        (SELECT count(*)::int FROM ticket_items ti WHERE ti.appointment_id=a.id) lines FROM private_appointments a WHERE ticket_id=${multi.ticket_id}`;
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.instructor_id === null && r.persons === 2 && r.lines === 1 && Number(r.price) === 200));
    assert.equal(new Set(rows.map((r) => r.period_group_id)).size, 1); assert.ok(rows[0].period_group_id);
    assert.equal(Number(multi.total), 600);
    const [{ n }] = await sql`SELECT count(*)::int n FROM action_tasks WHERE related_ticket_id=${multi.ticket_id}`;
    assert.equal(n, 1);
  });

  await t('missing teacher WITHOUT explicit intent is rejected and writes nothing', async () => {
    const before = await counts();
    const r = await create([{ date: D1, time_start: '12:00', time_end: '14:00' }]);
    assert.deepEqual([r.error, r.field, r.index], ['invalid', 'appointments', 0]);
    const r2 = await create([withT(D1, I1, '09:00', '10:00'), { date: D2, time_start: '12:00', time_end: '14:00' }]);
    assert.deepEqual([r2.error, r2.index], ['invalid', 1]);
    assert.deepEqual(await counts(), before);
  });

  await t('invalid intent forms are rejected: teacher+assign_later, assign_later false/non-boolean, unknown teacher', async () => {
    const before = await counts();
    for (const bad of [{ ...withT(D1, I1), assign_later: true }, { date: D1, time_start: '12:00', time_end: '14:00', assign_later: false },
      { date: D1, time_start: '12:00', time_end: '14:00', assign_later: 'true' }]) {
      const r = await create([bad]);
      assert.equal(r.error, 'invalid', JSON.stringify(bad));
    }
    await assert.rejects(create([withT(D1, id(0xdead))])); // FK: no fake instructor can be stored
    assert.deepEqual(await counts(), before);
  });

  await t('participant of another customer is still rejected (no linkage bypass)', async () => {
    const r = await create([later(D1)], { participants: [{ participant_id: P_FOREIGN }] });
    assert.deepEqual([r.error, r.field], ['invalid', 'participants']);
  });

  let assigned;
  await t('assigned creation unchanged: pending confirmation, teacher notification, no assign task', async () => {
    const before = await counts();
    assigned = await create([withT(D1, I1, '09:00', '11:00')]);
    assert.equal(assigned.ok, true, JSON.stringify(assigned));
    const a = await appt(assigned.appointment_ids[0]);
    assert.equal(a.instructor_id, I1); assert.equal(a.instructor_confirmation, 'pending'); assert.equal(a.ti_conf, 'pending');
    const after = await counts();
    assert.equal(after.task - before.task, 0); assert.equal(after.nq - before.nq, 1);
  });

  await t('assigned conflict still rejected (occupied slot), nothing written', async () => {
    const before = await counts();
    const r = await create([withT(D1, I1, '10:00', '12:00')]);
    assert.equal(r.error, 'conflict');
    assert.deepEqual(await counts(), before);
  });

  await t('mixed request: assigned + assign_later in one booking', async () => {
    const r = await create([withT(D2, I2, '09:00', '10:00'), later(D3, '15:00', '16:00')]);
    assert.equal(r.ok, true, JSON.stringify(r));
    const rows = await sql`SELECT instructor_id, instructor_confirmation FROM private_appointments WHERE ticket_id=${r.ticket_id} ORDER BY date`;
    assert.deepEqual(rows.map((x) => [x.instructor_id, x.instructor_confirmation]), [[I2, 'pending'], [null, null]]);
  });

  await t('later assignment to an occupied slot is rejected with no partial write', async () => {
    const aid = single.appointment_ids[0];
    // I1 busy 09–11 on D1 (assigned booking) -> overlapping move to 10–12 conflicts; keep 12–14 but block I1 by absence
    await sql`INSERT INTO instructor_absences(instructor_id,start_date,end_date,is_full_day,status,type) VALUES (${I2}, ${D1}, ${D1}, true, 'confirmed', 'other')`.catch(async () => {
      await sql`INSERT INTO instructor_absences(instructor_id,start_date,end_date,is_full_day,status) VALUES (${I2}, ${D1}, ${D1}, true, 'confirmed')`;
    });
    const before = await counts();
    const snap = await appt(aid);
    const r = await move(aid, D1, '12:00', '14:00', I2);
    assert.equal(r.error, 'conflict', JSON.stringify(r));
    const r2 = await move(aid, D1, '10:00', '12:00', I1);
    assert.equal(r2.error, 'conflict');
    assert.deepEqual(await counts(), before);
    const now = await appt(aid);
    assert.equal(now.instructor_id, null); assert.equal(now.instructor_confirmation, null); assert.equal(String(now.updated_at), String(snap.updated_at));
  });

  await t('later free assignment: teacher set atomically, pending confirmation, notification, price kept, no reset flag', async () => {
    const aid = single.appointment_ids[0];
    const before = await counts();
    const r = await move(aid, D1, '12:00', '14:00', I1);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.confirmation_reset, false);
    const a = await appt(aid);
    assert.equal(a.instructor_id, I1); assert.equal(a.ti_instr, I1);
    assert.equal(a.instructor_confirmation, 'pending'); assert.equal(a.ti_conf, 'pending');
    assert.equal(a.confirmation_reset_at, null);
    assert.equal(Number(a.price), 160); assert.equal(Number(a.ti_price), 160);
    const after = await counts();
    assert.equal(after.nq - before.nq, 1); // instructor.lesson.assigned via existing trigger
    const [{ total }] = await sql`SELECT total_amount total FROM tickets WHERE id=${single.ticket_id}`;
    assert.equal(Number(total), 160);
  });

  await t('teacher confirmation after assignment works; before assignment it is forbidden', async () => {
    const unassignedId = multi.appointment_ids[0];
    const [{ r: denied }] = await sql`SELECT pa_confirm_appointment(${unassignedId}, ${I1}, 'confirm', null, ${ACTOR}) r`;
    assert.equal(denied.error, 'forbidden');
    const [{ r: ok }] = await sql`SELECT pa_confirm_appointment(${single.appointment_ids[0]}, ${I1}, 'confirm', null, ${ACTOR}) r`;
    assert.equal(ok.instructor_confirmation, 'confirmed');
    const a = await appt(single.appointment_ids[0]);
    assert.equal(a.ti_conf, 'confirmed');
  });

  await t('period_update assigns all unassigned appointments atomically; one conflict rolls back all', async () => {
    const [{ g }] = await sql`SELECT period_group_id g FROM private_appointments WHERE id=${multi.appointment_ids[0]}`;
    // I1 already has D1 12–14 (assigned above) -> whole group conflicts, nothing written
    const before = await counts();
    const [{ r: bad }] = await sql`SELECT pa_period_update(${g}, ${sql.json({ instructor_id: I1 })}, ${ACTOR}) r`;
    assert.equal(bad.error, 'conflict');
    assert.deepEqual(await counts(), before);
    const [{ n0 }] = await sql`SELECT count(*)::int n0 FROM private_appointments WHERE period_group_id=${g} AND instructor_id IS NULL`;
    assert.equal(n0, 3);
    // time-only change on an unassigned group is rejected (needs a teacher), still nothing written
    const [{ r: timeOnly }] = await sql`SELECT pa_period_update(${g}, ${sql.json({ time_start: '13:00' })}, ${ACTOR}) r`;
    assert.equal(timeOnly.error, 'invalid');
    // I2 is absent on D1 -> also conflict; free teacher I3 works
    const I3 = id(0xf003);
    await sql`INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES (${I3},'C','Drei','active','{ski}')`;
    const [{ r: ok }] = await sql`SELECT pa_period_update(${g}, ${sql.json({ instructor_id: I3 })}, ${ACTOR}) r`;
    assert.equal(ok.ok, true, JSON.stringify(ok));
    const rows = await sql`SELECT a.instructor_id, a.instructor_confirmation, ti.instructor_id ti_i, ti.instructor_confirmation ti_c, a.price
      FROM private_appointments a JOIN ticket_items ti ON ti.appointment_id=a.id WHERE a.period_group_id=${g}`;
    assert.ok(rows.every((r) => r.instructor_id === I3 && r.ti_i === I3 && r.instructor_confirmation === 'pending' && r.ti_c === 'pending' && Number(r.price) === 200));
  });

  await t('mirror guard still forbids direct line divergence on an unassigned appointment', async () => {
    const r = await create([later(D3, '09:00', '10:00')]);
    await assert.rejects(sql`UPDATE ticket_items SET instructor_id=${I1} WHERE appointment_id=${r.appointment_ids[0]}`, /pa_guard/);
  });

  await t('assigned move regression: confirmed -> changed resets to pending with reset flag', async () => {
    const aid = assigned.appointment_ids[0];
    await sql`SELECT pa_confirm_appointment(${aid}, ${I1}, 'confirm', null, ${ACTOR})`;
    const r = await move(aid, D2, '13:00', '15:00', I1);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.confirmation_reset, true);
    const a = await appt(aid);
    assert.equal(a.instructor_confirmation, 'pending'); assert.ok(a.confirmation_reset_at);
  });
} catch (e) {
  results.push(`FAIL setup: ${e.message}`);
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
