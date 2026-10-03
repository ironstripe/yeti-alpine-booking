// Real SQL transaction tests for the pending 26/27 website booking SQL (#36).
// Runs ONLY in a throwaway local PostgreSQL built from the schema-only production
// baseline (real constraints, triggers, pa_* functions, RLS helpers) + synthetic data.
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/bc2627Booking.integration.mjs
import postgres from 'postgres';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `bc2627_test_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 30 });
const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

let passed = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); passed++; results.push(`ok   ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}

const S = '00000000-0000-4000-8000-000000000001';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const K4 = id(0xa4), K2 = id(0xa2), E4 = id(0xe4), CARV = id(0xc2), INACTIVE = id(0xff), SAT = id(0xb2);
const PRIV = id(0xd1), PRIVSB = id(0xd2);
const C1 = id(0xc1), C3 = id(0xc3), C5 = id(0xc5), C6 = id(0xc6);
const I1 = id(0xf001), I2 = id(0xf002), I3 = id(0xf003), I4 = id(0xf004);
const BK = 'weekday:2027-01-04:BK', AG = 'weekday:2027-01-04:AG', SA = 'saturday_series:2027-01-09:BK', OFF = 'weekday:2027-01-04:OFF';
const W4 = ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07'];

try {
  // Load SQL files with psql (byte-faithful, same as the migration path), not via the JS driver.
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/bc_2627_atomic_course_booking.sql']) {
    const r = spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL(f, root))],
      { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });
    if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }

  // ---------------- synthetic fixtures (post pricing-release state) ----------------
  await sql.unsafe(`
  INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
  INSERT INTO skill_levels(id,name,discipline,target_group,sort_order) VALUES ('ski_blauer_koenig','BK','ski','child',1),('ski_adult_green','AG','ski','adult',2);
  INSERT INTO products(id,name,type,duration_minutes,price,season_id,discipline,is_active,show_on_website,min_age,max_age,pricing_type) VALUES
   ('${K4}','Kinder 4h','group',240,0,'${S}','ski',true,true,4,16,'tiered'),
   ('${K2}','Kinder 2h','group',120,0,'${S}','ski',true,true,4,16,'tiered'),
   ('${E4}','Erwachsene 4h','group',240,0,'${S}','ski',true,true,17,99,'tiered'),
   ('${CARV}','Carving 2h','group',120,0,'${S}','ski',true,true,17,99,'tiered'),
   ('${INACTIVE}','Kinder 4h alt','group',240,0,'${S}','ski',false,true,4,16,'tiered'),
   ('${SAT}','Samstag 2h','group',120,0,'${S}','ski',true,true,4,16,'tiered'),
   ('${PRIV}','Privat Ski','private',60,0,'${S}','ski',true,true,null,null,'fixed'),
   ('${PRIVSB}','Privat Snowboard','private',60,0,'${S}','snowboard',true,true,null,null,'fixed');
  INSERT INTO product_price_tiers(product_id,day_count,cumulative_price)
   SELECT '${K4}'::uuid,d,100*d FROM generate_series(1,5) d
   UNION ALL SELECT '${K2}'::uuid,1,60
   UNION ALL SELECT '${E4}'::uuid,d,120*d FROM generate_series(1,5) d
   UNION ALL SELECT '${CARV}'::uuid,1,99
   UNION ALL SELECT '${SAT}'::uuid,4,240 UNION ALL SELECT '${SAT}'::uuid,5,290;
  INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
   SELECT 'k4-'||d,'${S}'::uuid,'${K4}'::uuid,'sha','Gruppe','draft',d,240,1,(100*d)::numeric,'{"group_capacity":2}'::jsonb FROM generate_series(1,5) d
   UNION ALL SELECT 'k2-1','${S}','${K2}','sha','Gruppe','draft',1,120,1,60,'{"group_capacity":2}'
   UNION ALL SELECT 'e4-'||d,'${S}','${E4}','sha','Gruppe','draft',d,240,1,120*d,'{"group_capacity":2}' FROM generate_series(1,5) d
   UNION ALL SELECT 'c2-1','${S}','${CARV}','sha','Carving','draft',1,120,1,99,'{}'
   UNION ALL SELECT 'sa-'||d,'${S}','${SAT}','sha','Samstagkurs','draft',d,120,1,CASE d WHEN 4 THEN 240 ELSE 290 END,'{"group_capacity":2}' FROM generate_series(4,5) d
   UNION ALL SELECT 'p1-'||n,'${S}','${PRIV}','sha','Privat','draft',1,60,n,70+20*n,'{}' FROM generate_series(1,3) n
   UNION ALL SELECT 'ps-'||n,'${S}','${PRIVSB}','sha','Privat','draft',1,60,n,70+20*n,'{}' FROM generate_series(1,3) n;
  -- I1 ski role; I2 ski via capability only; I3 ski but deployed only in Feb; I4 office only.
  INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES
   ('${I1}','A','Eins','active','{ski}'),('${I2}','B','Zwei','active','{}'),
   ('${I3}','C','Drei','active','{ski}'),('${I4}','D','Vier','active','{office}');
  INSERT INTO capabilities(id,name,category) VALUES ('${id(0xcab)}','Ski Erwachsene Anfänger','Ski');
  INSERT INTO instructor_capabilities(instructor_id,capability_id) VALUES ('${I2}','${id(0xcab)}');
  INSERT INTO instructor_deployment_windows(instructor_id,valid_from,valid_until,source) VALUES ('${I3}','2027-02-01','2027-02-28','manual');
  INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('08:00','17:00',80);
  INSERT INTO group_courses(id,name,discipline,min_age,max_age,max_participants,price_per_day,is_active,course_type,skill_level_id,product_id) VALUES
   ('${C1}','26/27 Ski BK','ski',4,16,2,0,true,'weekly','ski_blauer_koenig','${K4}'),
   ('${C3}','26/27 Ski Erwachsene','ski',17,99,2,0,true,'weekly','ski_adult_green','${E4}'),
   ('${C5}','26/27 Samstag Ski BK','ski',4,16,2,0,true,'saturday_course','ski_blauer_koenig','${SAT}'),
   ('${C6}','26/27 Ski BK (inaktiv)','ski',4,16,2,0,false,'weekly','ski_blauer_koenig','${K4}');
  INSERT INTO training_groups(id,course_id,week_start,group_number,status) VALUES
   ('${id(0xb1)}','${C1}','2027-01-04',1,'active'),('${id(0xb3)}','${C3}','2027-01-04',1,'active'),
   ('${id(0xb5)}','${C5}','2027-01-04',1,'active'),('${id(0xb6)}','${C6}','2027-01-04',1,'active');
  INSERT INTO bc_2627_course_period_sources(source_key,course_id,training_group_id,source_sha256,tariff_source_ids,teaching_dates,eligible_variants) VALUES
   ('${BK}','${C1}','${id(0xb1)}','sha',ARRAY['k4-1'],ARRAY['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08']::date[],
     '{"${K4}":[1,2,3,4,5],"${K2}":[1,2,3],"${INACTIVE}":[1]}'),
   ('${AG}','${C3}','${id(0xb3)}','sha',ARRAY['e4-1'],ARRAY['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08']::date[],
     '{"${E4}":[1,2,3,4,5],"${CARV}":[1]}'),
   ('${SA}','${C5}','${id(0xb5)}','sha',ARRAY['sa-5'],ARRAY['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06']::date[],'{"${SAT}":[4,5]}'),
   ('${OFF}','${C6}','${id(0xb6)}','sha',ARRAY['k4-1'],ARRAY['2027-01-04','2027-01-05']::date[],'{"${K4}":[1,2]}');
  INSERT INTO bc_2627_course_product_variants VALUES
   ('${C1}','${K4}','{1,2,3,4,5}'),('${C1}','${K2}','{1,2,3}'),('${C1}','${INACTIVE}','{1}'),
   ('${C3}','${E4}','{1,2,3,4,5}'),('${C3}','${CARV}','{1}'),('${C5}','${SAT}','{4,5}'),('${C6}','${K4}','{1,2}');
  INSERT INTO group_course_instances(id,course_id,date,start_time,end_time)
   SELECT bc_2627_instance_id(ps.source_key,d,b), ps.course_id, d, split_part(b,'-',1)::time, split_part(b,'-',2)::time
     FROM bc_2627_course_period_sources ps, unnest(ps.teaching_dates) d,
          unnest(CASE WHEN ps.source_key LIKE 'saturday%' THEN ARRAY['10:00-12:00'] ELSE ARRAY['10:00-12:00','14:00-16:00'] END) b;
  -- 2027-01-08 afternoon BK instance has drifted real times (14:30): must not count as the 14-16 block.
  UPDATE group_course_instances SET start_time='14:30' WHERE id=bc_2627_instance_id('${BK}','2027-01-08','14:00-16:00');
  INSERT INTO training_course_dates(training_id,date,is_cancelled)
   SELECT '${C5}',d,d='2027-01-30' FROM unnest(ARRAY['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06']::date[]) d;
  `);

  let n = 0;
  const key = () => `test-key-${++n}-${Date.now()}`;
  const kid = (ref, birth = '2018-05-01') => ({ ref, birth_date: birth, discipline: 'ski', skill_level: 'ski_blauer_koenig' });
  const adult = (ref) => ({ ref, birth_date: '1985-03-03', discipline: 'ski', skill_level: 'ski_adult_green' });
  const named = (p) => ({ ...p, first_name: `P-${p.ref}`, last_name: 'Familie' });
  const cust = (email = 'familie@example.invalid', extra = {}) => ({ email, first_name: 'Test', last_name: 'Familie', ...extra });
  const reserve = async (payload) => (await sql`SELECT bc_2627_reserve(${sql.json(payload)}) r`)[0].r;
  const finalize = async (r, people, c = cust()) => (await sql`SELECT bc_2627_finalize(${r.ticket_id}, ${r.reservation_token},
      ${sql.json(c)}, ${sql.json(people)}, ${null}) r`)[0].r;
  const begin = async (r) => (await sql`SELECT bc_2627_begin_invoice(${r.ticket_id}, ${r.reservation_token}) r`)[0].r;
  // Same DB effect as invoice-service.issueInvoice: one open invoice for the server-bound customer/total.
  // Production generate_invoice_number() is MAX+1 without a lock, so concurrent issuance can hit
  // invoices_invoice_number_key; the flow treats that as retryable (counted below).
  let invoiceRetries = 0;
  const issue = async (b) => {
    for (let i = 0; ; i++) {
      try {
        return await sql`INSERT INTO invoices(invoice_number,ticket_id,customer_id,subtotal,total,qr_reference,due_date,status,issued_at)
          VALUES ('', ${b.ticket_id}, ${b.customer_id}, ${b.total_amount}, ${b.total_amount}, '', CURRENT_DATE+14, 'open', now())
          ON CONFLICT (ticket_id) WHERE status = 'open' DO NOTHING RETURNING id`;
      } catch (e) { if (e.constraint_name !== 'invoices_invoice_number_key' || i > 20) throw e; invoiceRetries++; }
    }
  };
  const confirm = async (r) => (await sql`SELECT bc_2627_confirm(${r.ticket_id}, ${r.reservation_token}) r`)[0].r;
  const complete = async (r, people, c) => {
    const f = await finalize(r, people, c); if (f.status !== 'success') return { f };
    const b = await begin(r); if (b.status !== 'success') return { f, b };
    await issue(b); return { f, b, c: await confirm(r) };
  };
  const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) t, (SELECT count(*)::int FROM ticket_items) i,
      (SELECT count(*)::int FROM bc_2627_reservations) r, (SELECT count(*)::int FROM group_course_enrollments) e,
      (SELECT count(*)::int FROM private_appointments) a, (SELECT count(*)::int FROM invoices) inv`)[0];
  const cp = async (course, date, start = '10:00') => (await sql`SELECT current_participants c,
      (SELECT count(*)::int FROM group_course_enrollments e WHERE e.instance_id=gi.id) n FROM group_course_instances gi
      WHERE course_id=${course} AND date=${date} AND start_time=${start}`)[0];

  await t('grants: anon/authenticated cannot execute booking functions', async () => {
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(sql.begin(async (tx) => { await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx`SELECT bc_2627_reserve('{}'::jsonb)`; }), /permission denied/);
    }
  });

  await t('options: active course+product only, exact live instances, no incomplete 4h day, Carving informational', async () => {
    const o = (await sql`SELECT bc_2627_course_options('2027-01-01','2027-02-28') r`)[0].r;
    const keys = o.options.map((x) => `${x.period_key}|${x.product_id}`);
    assert.ok(keys.includes(`${BK}|${K4}`) && keys.includes(`${AG}|${E4}`) && keys.includes(`${SA}|${SAT}`));
    assert.ok(!keys.some((x) => x.startsWith(OFF)), 'inactive course offered');
    assert.ok(!keys.some((x) => x.endsWith(INACTIVE) || x.endsWith(CARV)), 'inactive/Carving offered');
    const k4 = o.options.find((x) => x.period_key === BK && x.product_id === K4);
    assert.deepEqual(k4.blocks[0].dates, W4, '4h excludes 2027-01-08 (afternoon block times drifted)');
    const k2 = o.options.find((x) => x.product_id === K2);
    assert.ok(k2.blocks.find((b) => b.block === '10:00-12:00').dates.includes('2027-01-08'));
    assert.ok(!k2.blocks.find((b) => b.block === '14:00-16:00').dates.includes('2027-01-08'));
    assert.deepEqual(k2.tiers.map((x) => x.day_count), [1]);
    const sat = o.options.find((x) => x.product_id === SAT);
    assert.ok(!sat.blocks[0].dates.includes('2027-01-30') && sat.cancelled_dates.includes('2027-01-30'));
  });

  let family;
  await t('family above threshold, different courses: one booking, one invoice, price once, overflow counted', async () => {
    const people = [kid('a'), kid('b', '2016-02-02'), kid('c', '2020-12-31'), adult('m')];
    const r = await reserve({ idempotency_key: key(), participants: people, selections: [
      { kind: 'group', participant_ref: 'a', period_key: BK, product_id: K4, dates: W4 },
      { kind: 'group', participant_ref: 'b', period_key: BK, product_id: K4, dates: W4 },
      { kind: 'group', participant_ref: 'c', period_key: BK, product_id: K4, dates: W4.slice(0, 3) },
      { kind: 'group', participant_ref: 'm', period_key: AG, product_id: E4, dates: W4.slice(0, 2) },
    ] });
    assert.equal(r.status, 'success', JSON.stringify(r));
    assert.equal(Number(r.total_amount), 400 + 400 + 300 + 240);
    const items = await sql`SELECT * FROM ticket_items WHERE ticket_id=${r.ticket_id}`;
    assert.equal(items.length, 4); assert.ok(items.every((i) => i.instructor_id === null), 'no phantom group instructor');
    const x = await complete(r, people.map(named));
    assert.equal(x.c?.status, 'success', JSON.stringify(x));
    assert.equal(x.c.enrollments_created, 8 + 8 + 6 + 4);
    const [inv] = await sql`SELECT count(*)::int n, sum(total) s FROM invoices WHERE ticket_id=${r.ticket_id}`;
    assert.equal(inv.n, 1); assert.equal(Number(inv.s), 1340);
    const c = await cp(C1, '2027-01-04'); assert.equal(c.c, 3); assert.equal(c.n, 3);
    const [tk] = await sql`SELECT status, total_amount FROM tickets WHERE id=${r.ticket_id}`;
    assert.equal(tk.status, 'confirmed'); assert.equal(Number(tk.total_amount), 1340);
    family = { r, people };
  });

  await t('more than 20 people and 40 selections: correct total, no lost enrollments', async () => {
    const people = Array.from({ length: 25 }, (_, i) => kid(`g${i}`));
    const selections = people.flatMap((p) => [
      { kind: 'group', participant_ref: p.ref, period_key: BK, product_id: K2, dates: ['2027-01-05'], block: '10:00-12:00' },
      { kind: 'group', participant_ref: p.ref, period_key: BK, product_id: K2, dates: ['2027-01-06'], block: '14:00-16:00' },
    ]);
    const r = await reserve({ idempotency_key: key(), participants: people, selections });
    assert.equal(r.status, 'success', JSON.stringify(r)); assert.equal(Number(r.total_amount), 50 * 60);
    const x = await complete(r, people.map(named));
    assert.equal(x.c?.status, 'success', JSON.stringify(x)); assert.equal(x.c.enrollments_created, 50);
    const a = await cp(C1, '2027-01-05', '10:00'), b = await cp(C1, '2027-01-06', '14:00');
    assert.equal(a.n, 3 + 25); assert.equal(a.c, a.n); assert.equal(b.n, 3 + 25); assert.equal(b.c, b.n);
  });

  await t('idempotent reserve; changed body conflicts; finalize replay ok, changed finalize rejected', async () => {
    const k = key();
    const payload = { idempotency_key: k, participants: [kid('x')], selections: [{ kind: 'group', participant_ref: 'x', period_key: BK, product_id: K4, dates: ['2027-01-04'] }] };
    const a = await reserve(payload); const before = await counts();
    const b = await reserve(payload);
    assert.equal(b.replayed, true); assert.equal(b.ticket_id, a.ticket_id); assert.deepEqual(await counts(), before);
    assert.equal((await reserve({ ...payload, notes: 'other' })).code, 'idempotency_conflict');
    assert.equal((await finalize(a, [named(kid('x'))])).status, 'success');
    const again = await finalize(a, [named(kid('x'))]);
    assert.equal(again.already_finalized, true); assert.equal(again.customer_id, undefined, 'no customer data returned');
    assert.equal((await finalize(a, [named(kid('x'))], cust('attacker@example.invalid'))).code, 'finalize_conflict');
    const [r] = await sql`SELECT recipient_email FROM bc_2627_reservations WHERE ticket_id=${a.ticket_id}`;
    assert.equal(r.recipient_email, 'familie@example.invalid');
  });

  await t('identity: existing customer reused by unique e-mail but never updated; ambiguous e-mail rejected', async () => {
    const [{ id: cid }] = await sql`INSERT INTO customers(email,first_name,last_name,street,city) VALUES ('Known@Example.invalid','Real','Owner','Echtweg 1','Vaduz') RETURNING id`;
    const r = await reserve({ idempotency_key: key(), participants: [kid('k')], selections: [{ kind: 'group', participant_ref: 'k', period_key: BK, product_id: K4, dates: ['2027-01-05'] }] });
    const f = await finalize(r, [named(kid('k'))], cust('known@example.invalid', { first_name: 'Fake', last_name: 'Name', street: 'Andere 9' }));
    assert.equal(f.status, 'success'); assert.equal(JSON.stringify(f).includes(cid), false);
    const [c] = await sql`SELECT first_name,last_name,street FROM customers WHERE id=${cid}`;
    assert.deepEqual({ ...c }, { first_name: 'Real', last_name: 'Owner', street: 'Echtweg 1' });
    await sql`INSERT INTO customers(email,first_name,last_name) VALUES ('dup@example.invalid','X','Y'),('DUP@example.invalid','Z','W')`;
    const r2 = await reserve({ idempotency_key: key(), participants: [kid('d')], selections: [{ kind: 'group', participant_ref: 'd', period_key: BK, product_id: K4, dates: ['2027-01-05'] }] });
    assert.equal((await finalize(r2, [named(kid('d'))], cust('dup@example.invalid'))).code, 'customer_ambiguous');
    const [{ n }] = await sql`SELECT count(*)::int n FROM customers WHERE lower(email)='dup@example.invalid'`;
    assert.equal(n, 2, 'no guessing and no new duplicate');
  });

  await t('confirm/invoice retries: one invoice, no duplicate enrollments', async () => {
    const before = await counts();
    const b = await begin(family.r); assert.equal(b.state, 'confirmed');
    assert.equal((await issue(b)).length, 0, 'second open invoice blocked by unique index');
    assert.equal((await confirm(family.r)).already_confirmed, true);
    assert.deepEqual(await counts(), before);
  });

  const rejects = async (name, payload, code) => t(name, async () => {
    const before = await counts();
    const r = await reserve({ idempotency_key: key(), ...payload });
    assert.equal(r.status, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r));
    assert.deepEqual(await counts(), before, 'no writes on rejection');
  });
  const g = (ref, extra) => ({ kind: 'group', participant_ref: ref, period_key: BK, product_id: K4, dates: ['2027-01-04'], ...extra });
  await rejects('missing tier (2h kids, 2 days) rejected', { participants: [kid('a')], selections: [g('a', { product_id: K2, dates: W4.slice(0, 2), block: '10:00-12:00' })] }, 'quote_rejected');
  await rejects('day count not allowed by variant', { participants: [kid('a')], selections: [g('a', { product_id: K2, dates: W4, block: '10:00-12:00' })] }, 'tier_unavailable');
  await rejects('invalid age at course date', { participants: [kid('a', '2010-01-03')], selections: [g('a')] }, 'invalid_age');
  await rejects('wrong level', { participants: [{ ...kid('a'), skill_level: 'ski_adult_green' }], selections: [g('a')] }, 'invalid_level');
  await rejects('date outside period', { participants: [kid('a')], selections: [g('a', { dates: ['2027-01-11'] })] }, 'invalid_dates');
  await rejects('duplicate dates', { participants: [kid('a')], selections: [g('a', { dates: ['2027-01-04', '2027-01-04'] })] }, 'invalid_dates');
  await rejects('null date element', { participants: [kid('a')], selections: [g('a', { dates: [null] })] }, 'invalid_dates');
  await rejects('null kind', { participants: [kid('a')], selections: [g('a', { kind: null })] }, 'invalid_selection');
  await rejects('null participant ref', { participants: [{ ...kid('a'), ref: null }], selections: [g('a')] }, 'invalid_participant');
  await rejects('null selections', { participants: [kid('a')], selections: null }, 'invalid_input');
  await rejects('inactive product', { participants: [kid('a')], selections: [g('a', { product_id: INACTIVE })] }, 'product_unavailable');
  await rejects('inactive course', { participants: [kid('a')], selections: [g('a', { period_key: OFF })] }, 'course_unavailable');
  await rejects('Carving not bookable', { participants: [adult('a')], selections: [{ kind: 'group', participant_ref: 'a', period_key: AG, product_id: CARV, dates: ['2027-01-04'], block: '10:00-12:00' }] }, 'product_unavailable');
  await rejects('drifted instance times (4h on 2027-01-08)', { participants: [kid('a')], selections: [g('a', { dates: ['2027-01-08'] })] }, 'invalid_dates');
  await rejects('cancelled Saturday', { participants: [kid('a')], selections: [{ kind: 'group', participant_ref: 'a', period_key: SA, product_id: SAT, dates: ['2027-01-09', '2027-01-16', '2027-01-23', '2027-01-30'], block: '10:00-12:00' }] }, 'invalid_dates');
  await rejects('mixed Saturday series', { participants: [kid('a')], selections: [{ kind: 'group', participant_ref: 'a', period_key: SA, product_id: SAT, dates: ['2027-01-09', '2027-01-16', '2027-01-23', '2027-02-20'], block: '10:00-12:00' }] }, 'invalid_dates');
  await rejects('participant without selection', { participants: [kid('a'), kid('b')], selections: [g('a')] }, 'invalid_selection');
  await rejects('duplicate selection for same participant', { participants: [kid('a')], selections: [g('a'), g('a', { dates: ['2027-01-04', '2027-01-05'] })] }, 'overlapping_selection');
  await rejects('group and private overlap for same participant', { participants: [kid('a')], selections: [g('a'),
    { kind: 'private', participant_refs: ['a'], product_id: PRIV, items: [{ date: '2027-01-04', time_start: '11:00', time_end: '12:00' }] }] }, 'overlapping_selection');
  await rejects('duplicated private refs', { participants: [kid('a')], selections: [{ kind: 'private', participant_refs: ['a', 'a'], product_id: PRIV, items: [{ date: '2027-01-12', time_start: '10:00', time_end: '11:00' }] }] }, 'invalid_selection');
  await rejects('private discipline mismatch', { participants: [kid('a')], selections: [{ kind: 'private', participant_refs: ['a'], product_id: PRIVSB, items: [{ date: '2027-01-12', time_start: '10:00', time_end: '11:00' }] }] }, 'invalid_level');
  await rejects('private null time', { participants: [kid('a')], selections: [{ kind: 'private', participant_refs: ['a'], product_id: PRIV, items: [{ date: '2027-01-12', time_start: null, time_end: '11:00' }] }] }, 'invalid_dates');
  await rejects('private persons without source tariff (4)', { participants: ['a', 'b', 'c', 'd'].map((r) => kid(r)), selections: [{ kind: 'private', participant_refs: ['a', 'b', 'c', 'd'], product_id: PRIV, items: [{ date: '2027-01-12', time_start: '10:00', time_end: '11:00' }] }] }, 'quote_rejected');

  await t('Saturday series of 4 valid dates books and enrolls 4 instances', async () => {
    const r = await reserve({ idempotency_key: key(), participants: [kid('s')], selections: [{ kind: 'group', participant_ref: 's', period_key: SA, product_id: SAT, dates: ['2027-01-09', '2027-01-16', '2027-01-23', '2027-02-06'], block: '10:00-12:00' }] });
    assert.equal(r.status, 'success', JSON.stringify(r)); assert.equal(Number(r.total_amount), 240);
    assert.equal((await complete(r, [named(kid('s'))])).c.enrollments_created, 4);
  });

  await t('concurrent above-threshold group bookings all succeed; counts exact', async () => {
    const before = { '10:00': (await cp(C1, '2027-01-07', '10:00')).n, '14:00': (await cp(C1, '2027-01-07', '14:00')).n };
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => reserve({ idempotency_key: key(), participants: [kid(`k${i}`)],
      selections: [{ kind: 'group', participant_ref: `k${i}`, period_key: BK, product_id: K4, dates: ['2027-01-07'] }] })));
    assert.ok(rs.every((r) => r.status === 'success'), JSON.stringify(rs.find((r) => r.status !== 'success')));
    const done = await Promise.all(rs.map((r, i) => complete(r, [named(kid(`k${i}`))])));
    assert.ok(done.every((x) => x.c?.status === 'success'), JSON.stringify(done.find((x) => x.c?.status !== 'success')));
    for (const s of ['10:00', '14:00']) { const c = await cp(C1, '2027-01-07', s); assert.equal(c.n, before[s] + 12, `${s} before=${before[s]}`); assert.equal(c.c, c.n, 'counter equals real enrollments'); }
  });

  await t('concurrent identical retries create exactly one booking', async () => {
    const payload = { idempotency_key: key(), participants: [kid('z')], selections: [g('z', { dates: ['2027-01-06'] })] };
    const rs = await Promise.all(Array.from({ length: 6 }, () => reserve(payload)));
    assert.equal(new Set(rs.map((r) => r.ticket_id)).size, 1); assert.equal(rs.filter((r) => !r.replayed).length, 1);
  });

  const priv = (refs, items) => ({ idempotency_key: key(), participants: refs.map((r) => kid(r)),
    selections: [{ kind: 'private', product_id: PRIV, participant_refs: refs, items }] });

  await t('private: native appointments, every participant, mirrored billing line, pa guard satisfied', async () => {
    const r = await reserve(priv(['p', 'q', 's'], [{ date: '2027-01-13', time_start: '10:00', time_end: '11:00' }, { date: '2027-01-14', time_start: '10:00', time_end: '11:00' }]));
    assert.equal(r.status, 'success', JSON.stringify(r)); assert.equal(Number(r.total_amount), 2 * 130);
    const appts = await sql`SELECT * FROM private_appointments WHERE ticket_id=${r.ticket_id} ORDER BY date`;
    assert.equal(appts.length, 2); assert.equal(new Set(appts.map((a) => a.instructor_id)).size, 1, 'one consistent instructor');
    assert.ok(appts[0].period_group_id && appts[0].period_group_id === appts[1].period_group_id);
    assert.equal((await sql`SELECT count(*)::int n FROM ticket_items WHERE ticket_id=${r.ticket_id}`)[0].n, 0, 'no instructor notification/billing before confirm');
    const x = await complete(r, ['p', 'q', 's'].map((p) => named(kid(p))));
    assert.equal(x.c?.status, 'success', JSON.stringify(x)); assert.equal(x.c.private_lines_created, 2);
    const paps = await sql`SELECT appointment_id, count(*)::int n FROM private_appointment_participants WHERE appointment_id = ANY(${appts.map((a) => a.id)}) GROUP BY 1`;
    assert.deepEqual(paps.map((p) => p.n), [3, 3]);
    const lines = await sql`SELECT * FROM ticket_items WHERE ticket_id=${r.ticket_id} ORDER BY date`;
    assert.equal(lines.length, 2); assert.ok(lines.every((l) => l.appointment_id && l.group_participant_count === 3 && Number(l.unit_price) === 130));
    const [{ n: q }] = await sql`SELECT count(*)::int n FROM notification_queue WHERE payload->>'ticket_id'=${r.ticket_id}`;
    assert.equal(q, 1, 'canonical pa_emit_change at confirm');
  });

  await t('private: capability, deployment window, absence, group/office assignments gate availability', async () => {
    // Jan: only I1 (role) and I2 (capability) can teach; I3 not deployed in Jan; I4 office only.
    const slot = [{ date: '2027-01-12', time_start: '10:00', time_end: '11:00' }];
    const rs = await Promise.all([0, 1, 2].map((i) => reserve(priv([`c${i}`], slot))));
    const ok = rs.filter((r) => r.status === 'success');
    assert.equal(ok.length, 2, JSON.stringify(rs)); assert.equal(rs.find((r) => r.status !== 'success').code, 'slot_unavailable');
    const ins = (await sql`SELECT DISTINCT instructor_id::text i FROM private_appointments WHERE ticket_id = ANY(${ok.map((r) => r.ticket_id)})`).map((x) => x.i).sort();
    assert.deepEqual(ins, [I1, I2].sort());
    // Feb: I3 deployed. Block I1 by group assignment, I2 by office block -> I3 chosen.
    await sql`UPDATE group_course_instances SET instructor_id=${I1} WHERE id=bc_2627_instance_id(${SA},'2027-02-06','10:00-12:00')`;
    await sql`INSERT INTO office_hour_blocks(instructor_id,date,time_start,time_end) VALUES (${I2},'2027-02-06','09:00','12:00')`;
    const f = await reserve(priv(['f'], [{ date: '2027-02-06', time_start: '10:00', time_end: '11:00' }]));
    assert.equal(f.status, 'success', JSON.stringify(f));
    assert.equal((await sql`SELECT instructor_id::text i FROM private_appointments WHERE ticket_id=${f.ticket_id}`)[0].i, I3);
    // Two-day booking: I1 absent day 2 -> I2 for both days (consistent instructor).
    await sql`INSERT INTO instructor_absences(instructor_id,start_date,end_date,type,status,is_full_day) VALUES (${I1},'2027-01-20','2027-01-20','vacation','confirmed',true)`;
    const two = await reserve(priv(['t'], [{ date: '2027-01-19', time_start: '10:00', time_end: '11:00' }, { date: '2027-01-20', time_start: '10:00', time_end: '11:00' }]));
    assert.deepEqual((await sql`SELECT DISTINCT instructor_id::text i FROM private_appointments WHERE ticket_id=${two.ticket_id}`).map((x) => x.i), [I2]);
  });

  await t('concurrent website reserve vs office pa_create_booking on the last free instructor: exactly one wins', async () => {
    const [{ id: cid }] = await sql`INSERT INTO customers(email,first_name,last_name) VALUES ('office@example.invalid','O','Kunde') RETURNING id`;
    let wins = 0;
    for (const d of ['2027-01-25', '2027-01-26', '2027-01-27', '2027-01-28', '2027-01-29']) {
      await sql`INSERT INTO instructor_absences(instructor_id,start_date,end_date,type,status,is_full_day) VALUES (${I2},${d},${d},'other','confirmed',true)`;
      const office = sql`SELECT pa_create_booking(${sql.json({ submission_key: `office-${d}-xyz`, customer_id: cid, product_id: PRIV,
        appointments: [{ date: d, time_start: '10:00', time_end: '11:00', instructor_id: I1 }],
        participants: [{ guest_key: 'g1', first_name: 'Gast', last_name: 'X', birth_date: '2015-01-01' }] })}, ${null}) r`.then((x) => x[0].r);
      const web = reserve(priv([`w${d}`], [{ date: d, time_start: '10:30', time_end: '11:30' }]));
      const [o, w] = await Promise.all([office, web]);
      const oOk = o.ok === true, wOk = w.status === 'success';
      assert.ok(oOk !== wOk, `${d}: office ${JSON.stringify(o)} web ${JSON.stringify(w)}`);
      const [{ n }] = await sql`SELECT count(*)::int n FROM private_appointments WHERE instructor_id=${I1} AND date=${d} AND status<>'cancelled'`;
      assert.equal(n, 1); wins += wOk ? 1 : 0;
    }
    results.push(`info website won ${wins}/5 races; invoice-number collisions retried so far: ${invoiceRetries}`);
  });

  await t('expiry: expired hold cannot finalize/begin; released lazily; slot freed', async () => {
    const r = await reserve(priv(['e'], [{ date: '2027-01-21', time_start: '10:00', time_end: '11:00' }]));
    await sql`UPDATE tickets SET reservation_expires_at=now()-interval '1 minute' WHERE id=${r.ticket_id}`;
    assert.equal((await finalize(r, [named(kid('e'))])).code, 'expired');
    assert.equal((await begin(r)).code, 'not_finalized');
    assert.equal((await sql`SELECT bc_2627_release_expired() n`)[0].n >= 1, true);
    assert.equal((await sql`SELECT status FROM private_appointments WHERE ticket_id=${r.ticket_id}`)[0].status, 'cancelled');
    assert.equal((await sql`SELECT state FROM bc_2627_reservations WHERE ticket_id=${r.ticket_id}`)[0].state, 'released');
  });

  await t('finalized then expired before invoicing: begin refused, no invoice', async () => {
    const r = await reserve({ idempotency_key: key(), participants: [kid('h')], selections: [g('h', { dates: ['2027-01-05'] })] });
    await finalize(r, [named(kid('h'))]);
    await sql`UPDATE tickets SET reservation_expires_at=now()-interval '1 minute' WHERE id=${r.ticket_id}`;
    assert.equal((await finalize(r, [named(kid('h'))])).code, 'expired', 'replay checks expiry first');
    assert.equal((await begin(r)).code, 'expired');
    assert.equal((await sql`SELECT count(*)::int n FROM invoices WHERE ticket_id=${r.ticket_id}`)[0].n, 0);
    assert.equal((await confirm(r)).code, 'invalid_status');
  });

  await t('invoicing is point of no return: expiry job and cancel cannot release; confirm still succeeds', async () => {
    const r = await reserve({ idempotency_key: key(), participants: [kid('i')], selections: [g('i', { dates: ['2027-01-05'] })] });
    await finalize(r, [named(kid('i'))]);
    const b = await begin(r); assert.equal(b.status, 'success');
    await sql`UPDATE tickets SET reservation_expires_at=now()-interval '1 minute' WHERE id=${r.ticket_id}`;
    await sql`SELECT bc_2627_release_expired()`;
    await sql`SELECT expire_reservations()`;
    assert.equal((await sql`SELECT bc_2627_cancel(${r.ticket_id}, ${r.reservation_token}) r`)[0].r.code, 'invalid_status');
    await issue(b);
    assert.equal((await confirm(r)).status, 'success');
  });

  await t('concurrent cancel vs begin_invoice: never an invoice on a released hold', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await reserve({ idempotency_key: key(), participants: [kid(`cb${i}`)], selections: [g(`cb${i}`, { dates: ['2027-01-06'] })] });
      await finalize(r, [named(kid(`cb${i}`))]);
      const [c, b] = await Promise.all([sql`SELECT bc_2627_cancel(${r.ticket_id}, ${r.reservation_token}) r`.then((x) => x[0].r), begin(r)]);
      assert.ok((c.status === 'success') !== (b.status === 'success'), JSON.stringify({ c, b }));
      if (b.status === 'success') { await issue(b); assert.equal((await confirm(r)).status, 'success'); }
      else assert.equal((await sql`SELECT count(*)::int n FROM invoices WHERE ticket_id=${r.ticket_id}`)[0].n, 0);
    }
  });

  await t('immutable quote total is authoritative; snapshot cannot be altered or deleted', async () => {
    const r = await reserve({ idempotency_key: key(), participants: [kid('q')], selections: [g('q', { dates: ['2027-01-05'] })] });
    await finalize(r, [named(kid('q'))]);
    await sql`UPDATE tickets SET total_amount=1 WHERE id=${r.ticket_id}`;
    assert.equal((await begin(r)).code, 'total_mismatch');
    await assert.rejects(sql`UPDATE bc_2627_reservations SET quote_total=1 WHERE ticket_id=${r.ticket_id}`, /immutable/);
    await assert.rejects(sql`UPDATE bc_2627_reservations SET recipient_email='x@y.z' WHERE ticket_id=${r.ticket_id}`, /immutable/);
    await assert.rejects(sql`DELETE FROM bc_2627_reservations WHERE ticket_id=${r.ticket_id}`, /never deleted/);
    await sql`UPDATE tickets SET total_amount=100 WHERE id=${r.ticket_id}`;
    const b = await begin(r);
    await sql`INSERT INTO invoices(invoice_number,ticket_id,customer_id,subtotal,total,qr_reference,due_date,status) VALUES ('',${r.ticket_id},${b.customer_id},1,1,'',CURRENT_DATE+14,'open')`;
    assert.equal((await confirm(r)).code, 'invoice_mismatch');
  });

  await t('cancel is atomic and token-checked', async () => {
    const r = await reserve(priv(['x'], [{ date: '2027-01-22', time_start: '10:00', time_end: '11:00' }]));
    assert.equal((await sql`SELECT bc_2627_cancel(${r.ticket_id}, ${'wrong-token'}) r`)[0].r.code, 'not_found');
    const c = (await sql`SELECT bc_2627_cancel(${r.ticket_id}, ${r.reservation_token}) r`)[0].r;
    assert.equal(c.status, 'success'); assert.equal(c.released_appointments, 1);
    assert.equal((await sql`SELECT bc_2627_cancel(${r.ticket_id}, ${r.reservation_token}) r`)[0].r.already_released, true);
  });

  await t('legacy compatibility: private quote by source; group quote has no person cap', async () => {
    const q = (await sql`SELECT quote_bc_2627_product(${PRIV}, ${sql.json([{ date: '2027-01-12', time_start: '12:00', time_end: '13:00' }])}, 2) r`)[0].r;
    assert.equal(Number(q.total_amount), 110);
    const gq = (await sql`SELECT quote_bc_2627_product(${K4}, ${sql.json([{ date: '2027-01-04', time_start: '10:00', time_end: '12:00' }, { date: '2027-01-04', time_start: '14:00', time_end: '16:00' }])}, 37) r`)[0].r;
    assert.equal(Number(gq.total_amount), 3700);
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
console.log(results.join('\n'));
const total = results.filter((r) => !r.startsWith('info')).length;
console.log(`${passed}/${total} passed`);
if (passed !== total) process.exit(1);
