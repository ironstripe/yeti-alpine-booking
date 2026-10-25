// B11: real SQL tests for supabase/pending/b11_created_total_event.sql (created-event total).
// Throwaway local PostgreSQL only: schema-only production baseline + pending SQL + synthetic data.
//   PA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/paAssignLater.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.PA_TEST_DATABASE_URL ?? process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false, ...(process.env.BC_TEST_SOCKET ? { host: '/tmp', port: 55432 } : {}) };
const dbName = `b11_${Date.now()}`;
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
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', ...(process.env.PA_BASELINE_ONLY ? [] : ['supabase/pending/pa_assign_later.sql', 'supabase/pending/b11_created_total_event.sql'])]) {
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


  const ev = (ticket) => sql`SELECT event_type, details FROM ticket_history WHERE ticket_id=${ticket} ORDER BY created_at, event_type`;
  await t('created: BOOKING_CREATED keeps initial 0; created event stores final positive total in same transaction', async () => {
    const r = await create([withT(D1, I1)]); assert.ok(r.ok, JSON.stringify(r));
    const e = await ev(r.ticket_id);
    const bc = e.find((x) => x.event_type === 'BOOKING_CREATED'); const pc = e.filter((x) => x.event_type === 'PRIVATE_APPOINTMENT_CHANGED');
    assert.equal(Number(bc.details.total_amount), 0);
    assert.equal(pc.length, 1); assert.equal(pc[0].details.change, 'created');
    assert.equal(Number(pc[0].details.ticket_total_after_create), Number(r.total)); assert.ok(Number(r.total) > 0);
    assert.equal(pc[0].details.persons, 1);
  });
  await t('replay: no second created event', async () => {
    const k2 = key(); const a = await create([withT(D2, I1)], { submission_key: k2 }); const before = (await ev(a.ticket_id)).length;
    const b = await create([withT(D2, I1)], { submission_key: k2 }); assert.equal(b.ticket_id, a.ticket_id);
    assert.equal((await ev(a.ticket_id)).length, before);
  });
  await t('failure: rejected create leaves no history row', async () => {
    const before = (await sql`SELECT count(*)::int n FROM ticket_history`)[0].n;
    const r = await create([withT(D1, I1)], { participants: [{ participant_id: P_FOREIGN }] }); assert.ok(!r.ok);
    assert.equal((await sql`SELECT count(*)::int n FROM ticket_history`)[0].n, before);
  });
  await t('moved event unchanged (no total key added); later move does not alter stored created total', async () => {
    const r = await create([withT(D3, I1)]); const created = (await ev(r.ticket_id)).find((x) => x.details.change === 'created').details.ticket_total_after_create;
    const m = await move(r.appointment_ids[0], D3, '13:00', '15:00', I2); assert.ok(m.ok, JSON.stringify(m));
    const e = await ev(r.ticket_id); const mv = e.find((x) => x.details.change === 'moved');
    assert.ok(mv && !('ticket_total_after_create' in mv.details));
    assert.equal(e.find((x) => x.details.change === 'created').details.ticket_total_after_create, created);
  });
  await t('rollback restores previous body; existing events kept; grants unchanged', async () => {
    const n = (await sql`SELECT count(*)::int n FROM ticket_history WHERE details ? 'ticket_total_after_create'`)[0].n;
    const acl = async () => (await sql`SELECT coalesce(proacl::text,'') a FROM pg_proc WHERE proname='pa_emit_change'`)[0].a; const aclBefore = await acl();
    const r = spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL('supabase/pending/b11_created_total_event_rollback.sql', root))], { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });
    assert.equal(r.status, 0, r.stderr);
    assert.equal((await sql`SELECT count(*)::int n FROM ticket_history WHERE details ? 'ticket_total_after_create'`)[0].n, n);
    const c = await create([withT(D1, I2, '09:00', '10:00')]); const e = (await ev(c.ticket_id)).find((x) => x.details.change === 'created');
    assert.ok(!('ticket_total_after_create' in e.details));
    assert.equal(await acl(), aclBefore);
  });
} finally {
  console.log(results.join('\n')); console.log(`${passed}/${results.length} passed`);
  await sql.end(); await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin.end();
  process.exitCode = passed === results.length && results.length > 0 ? 0 : 1;
}
