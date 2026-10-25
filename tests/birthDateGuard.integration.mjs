// B08: future/invalid birth dates rejected by the authoritative participant trigger
// (supabase/pending/participant_birth_date_guard.sql) on top of the 0001-0007 + lunch + B05 lineage.
// Throwaway local PostgreSQL only, synthetic data. Setup mirrors staffFinalize.integration.mjs.
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun ./tests/birthDateGuard.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false, ...(process.env.BC_TEST_SOCKET === '/tmp' ? { host: '/tmp', port: Number(u.port) || 55432 } : {}) };
const dbName = `b08_dob_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [process.env.BC_TEST_SOCKET === '/tmp' ? `postgresql://${u.pathname}?host=/tmp&port=55432&user=postgres` : u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root)), ...(process.env.BC_TEST_SOCKET === '/tmp' ? ['-h', '/tmp'] : [])],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), S_OLD = id(9), P4 = id(2), PRIV = id(0xd1), LUNCH = id(5), ACTOR = id(0xbeef), HOTEL = id(0xb0);
const CUST = id(0xc1), CUST2 = id(0xc2), PA = id(0xa1), PB = id(0xa2), PX = id(0xa9);
const C_NOMP = id(0x150), C_SB = id(0x130), I1 = id(0xf001);
const WEEK = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'];
const XMAS = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25'];
const TIERS4 = [150, 200, 245, 285, 320];
let keyN = 0; const key = () => `fin-key-${++keyN}-${Date.now()}`;
const gbook = (p) => sql`SELECT public.bc_2627_staff_group_book(${sql.json(p)}::jsonb, ${ACTOR}::uuid) r`.then((x) => x[0].r);
const pbook = (p) => sql`SELECT public.pa_create_booking_finalized(${sql.json(p)}::jsonb, ${ACTOR}::uuid) r`.then((x) => x[0].r);
const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) tickets, (SELECT count(*)::int FROM ticket_items) items,
  (SELECT count(*)::int FROM payments) pay, (SELECT count(*)::int FROM ticket_comments) com, (SELECT count(*)::int FROM customer_participants) parts,
  (SELECT count(*)::int FROM group_course_enrollments) enr, (SELECT count(*)::int FROM private_appointments) appts`)[0];
const fin = (o = {}) => ({ payment_method: 'cash', settlement: 'paid_now', payment_due_date: null, internal_notes: 'Intern', instructor_notes: 'Für Lehrer', actor_name: 'office', ...o });

async function seedCourse(cid, name, { mp = null, discipline = 'ski' } = {}) {
  await sql`INSERT INTO group_courses(id,name,discipline,min_age,max_age,price_per_day,is_active,product_id,course_type,meeting_point,max_participants)
    VALUES (${cid},${name},${discipline},4,16,0,true,${P4},'weekly',${mp},2)`;
  for (const d of [...WEEK, ...XMAS]) for (const [a, b] of [['10:00', '12:00'], ['14:00', '16:00']])
    await sql`INSERT INTO group_course_instances(course_id,date,start_time,end_time,status,current_participants) VALUES (${cid},${d},${a},${b},'scheduled',0)`;
  await sql`INSERT INTO bc_2627_course_product_variants(course_id,product_id,eligible_day_counts) VALUES (${cid},${P4},${[1, 2, 3, 4, 5]})`;
}

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/pa_assign_later.sql',
    'supabase/pending/course_archive_delete.sql', 'supabase/pending/bc_2627_staff_group_booking.sql',
    'supabase/pending/bc_2627_staff_group_booking_v2.sql', 'supabase/pending/staff_booking_finalize.sql']) {
    const r = psqlFile(f); if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }
  // Pre-0007 bodies (compare with live readback before installing 0007).
  for (const x of await sql`SELECT proname, md5(prosrc) m FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('pa_create_booking','bc_2627_staff_group_book') ORDER BY 1`)
    results.push(`     pre-0007 md5 ${x.proname} ${x.m}`);
  { const r = psqlFile('supabase/pending/staff_guest_level.sql'); if (r.status !== 0) throw new Error(`psql 0007: ${r.stderr}`); }
  { const r = psqlFile('supabase/pending/group_lunch_full_day.sql'); if (r.status !== 0) throw new Error(`psql lunch: ${r.stderr}`); }
  { const r = psqlFile('supabase/pending/b04_delivery_compatibility.sql'); if (r.status !== 0) throw new Error(`psql b04: ${r.stderr}`); }
  { const r = psqlFile('supabase/pending/b05_office_confirmation_intent.sql'); if (r.status !== 0) throw new Error(`psql b05: ${r.stderr}`); }
  { const r = psqlFile('supabase/pending/participant_birth_date_guard.sql'); if (r.status !== 0) throw new Error(`psql b08: ${r.stderr}`); }
  for (const x of await sql`SELECT proname, md5(prosrc) m FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('pa_create_booking','bc_2627_staff_group_book','staff_guest_level_ok') ORDER BY 1`)
    results.push(`     0007 md5 ${x.proname} ${x.m}`);
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-05' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15'),('${S_OLD}','Winter 25/26','2025-12-01','2026-04-06');
    INSERT INTO products(id,name,type,price,season_id,is_active,duration_minutes) VALUES
      ('${P4}','26/27 Kinder Ganztag','group',0,'${S}',true,240),('${PRIV}','Privat 1h','private',0,'${S}',true,60),
      ('${LUNCH}','Mittagsbetreuung','lunch',30,'${S_OLD}',true,NULL);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ('${I1}','A','Eins','active','{ski}');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('08:00','17:00',80);
    INSERT INTO billing_partners(id,name) VALUES ('${HOTEL}','Hotel Synth');
    INSERT INTO customers(id,first_name,last_name,email,customer_number) VALUES ('${CUST}','Test','Kunde','t1@example.invalid','K-T1'),('${CUST2}','Andere','Kundin','t2@example.invalid','K-T2');
    INSERT INTO customer_participants(id,customer_id,first_name,birth_date) VALUES ('${PA}','${CUST}','Anna','2016-01-01'),('${PB}','${CUST}','Ben','2017-01-01'),('${PX}','${CUST2}','Fremd','2015-01-01');
  `);
  for (let d = 1; d <= 5; d++) {
    await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES (${P4},${d},${TIERS4[d - 1]})`;
    await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
      VALUES (${'src-4h-' + d},${S},${P4},'sha','Kinderkurs','draft',${d},240,1,${TIERS4[d - 1]},'{"group_capacity":2}')`;
  }
  await seedCourse(C_NOMP, 'Ski Ohne Treffpunkt');
  await seedCourse(C_SB, 'Snowboard Kids', { discipline: 'snowboard', mp: 'Täli' });
  const gline = (o) => ({ course_id: C_NOMP, product_id: P4, dates: WEEK, block: null, sport: 'ski', expected_unit_price: 320, meeting_point: 'malbipark', ...o });
  // Business date pinned to 2026-10-05 above; "tomorrow" = 2026-10-06.
  const err = async (q) => { try { await q; return null; } catch (e) { return e; } };
  const guest = (o) => ({ guest_key: 'guest-' + Math.random().toString(36).slice(2, 10), first_name: 'Neu', birth_date: '2018-01-01', ...o });
  const pslot = { date: '2026-12-14', time_start: '09:00', time_end: '10:00', instructor_id: I1 };

  await t('trigger: insert with today/past/NULL ok; tomorrow and far future rejected (22008)', async () => {
    await sql`INSERT INTO customer_participants(customer_id,first_name,birth_date) VALUES (${CUST},'Heute','2026-10-05'),(${CUST},'Alt','1950-06-01'),(${CUST},'Unbekannt',NULL)`;
    for (const d of ['2026-10-06', '2999-01-01']) {
      const e = await err(sql`INSERT INTO customer_participants(customer_id,first_name,birth_date) VALUES (${CUST},'Zukunft',${d})`);
      assert.equal(e?.code, '22008', d);
    }
    const e = await err(sql`INSERT INTO customer_participants(customer_id,first_name,birth_date) VALUES (${CUST},'Feb','2027-02-30')`);
    assert.ok(e && e.code !== undefined, 'impossible date rejected by type');
  });

  await t('trigger: historic future value stays editable when birth_date unchanged; explicit change to future fails, to past ok', async () => {
    await sql`ALTER TABLE customer_participants DISABLE TRIGGER trg_participant_birth_date_guard`;
    const [{ id: hid }] = await sql`INSERT INTO customer_participants(customer_id,first_name,birth_date) VALUES (${CUST},'Import','2030-01-01') RETURNING id`;
    await sql`ALTER TABLE customer_participants ENABLE TRIGGER trg_participant_birth_date_guard`;
    await sql`UPDATE customer_participants SET first_name='Import2', birth_date='2030-01-01' WHERE id=${hid}`;
    await sql`UPDATE customer_participants SET notes='x' WHERE id=${hid}`;
    assert.equal((await err(sql`UPDATE customer_participants SET birth_date='2031-01-01' WHERE id=${hid}`))?.code, '22008');
    await sql`UPDATE customer_participants SET birth_date=NULL WHERE id=${hid}`;
    await sql`UPDATE customer_participants SET birth_date='2014-04-04' WHERE id=${hid}`;
    assert.equal((await sql`SELECT birth_date::text b FROM customer_participants WHERE id=${hid}`)[0].b, '2014-04-04');
  });

  await t('private (tampered request, finalized + B05 wrapper): future guest DOB rolls back person/ticket/appointment/payment/intent', async () => {
    const before = await counts();
    const intents = async () => (await sql`SELECT count(*)::int n FROM pg_tables WHERE tablename='office_booking_confirmation_intents'`)[0].n
      ? (await sql`SELECT count(*)::int n FROM office_booking_confirmation_intents`)[0].n : 0;
    const i0 = await intents();
    const p = { submission_key: key(), customer_id: CUST, product_id: PRIV, appointments: [pslot],
      participants: [{ participant_id: PA }, guest({ birth_date: '2026-10-06' })], finalization: fin() };
    assert.equal((await err(pbook(p)))?.code, '22008');
    assert.equal((await err(sql`SELECT public.b05_office_create(${sql.json({ ...p, submission_key: key(), confirmation_requested: true })}::jsonb, ${ACTOR}::uuid, 'private') r`))?.code, '22008');
    assert.deepEqual(await counts(), before); assert.equal(await intents(), i0);
    const ok = await pbook({ ...p, submission_key: key(), participants: [{ participant_id: PA }, guest({ birth_date: '2026-10-05' })] });
    assert.ok(ok.ticket_id, JSON.stringify(ok)); // today is a valid birth date; existing participant reused
  });

  await t('group (tampered request): future guest DOB rolls back person/ticket/enrollment/payment', async () => {
    const before = await counts();
    const e = await err(gbook({ submission_key: key(), customer_id: CUST2, finalization: fin(),
      lines: [gline({ participant_id: PX }), gline({ course_id: C_SB, sport: 'snowboard', meeting_point: 'Täli', guest: guest({ birth_date: '2027-01-01', sport: 'snowboard' }) })] }));
    assert.equal(e?.code, '22008');
    assert.deepEqual(await counts(), before);
  });

  await t('existing participants with unchanged historic DOB still bookable', async () => {
    await sql`ALTER TABLE customer_participants DISABLE TRIGGER trg_participant_birth_date_guard`;
    const [{ id: fid }] = await sql`INSERT INTO customer_participants(customer_id,first_name,birth_date) VALUES (${CUST},'AltImport','2027-03-03') RETURNING id`;
    await sql`ALTER TABLE customer_participants ENABLE TRIGGER trg_participant_birth_date_guard`;
    const r = await pbook({ submission_key: key(), customer_id: CUST, product_id: PRIV, appointments: [{ ...pslot, date: '2026-12-15' }], participants: [{ participant_id: fid }], finalization: fin() });
    assert.ok(r.ticket_id, JSON.stringify(r));
  });
} finally {
  console.log(results.join('\n'));
  console.log(`${passed}/${results.filter((r) => !r.startsWith('     ')).length} passed`);
  await sql.end(); await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin.end();
  process.exitCode = passed === results.filter((r) => !r.startsWith('     ')).length && passed > 0 ? 0 : 1;
}
