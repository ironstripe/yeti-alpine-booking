// Real SQL transaction tests for the 26/27 atomic website booking RPCs (#36).
// Runs ONLY against a throwaway local PostgreSQL (synthetic fixtures, no production data):
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/bc2627Booking.integration.mjs
import postgres from 'postgres';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const dbName = `bc2627_test_${Date.now()}`;
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { max: 20, onnotice: () => {} });
const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

let passed = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); passed++; results.push(`ok   ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}

try {
  await sql.unsafe(read('tests/sql/bc2627_booking_fixture_schema.sql'));
  await sql.unsafe(read('supabase/migrations/20261003220000_bc_2627_atomic_course_booking.sql'));

  // ---------------- synthetic fixtures ----------------
  await sql.unsafe(`
  INSERT INTO seasons(id,name,start_date,end_date,is_current) VALUES ('00000000-0000-4000-8000-000000000001','Winter 26/27','2026-12-01','2027-04-15',true);
  INSERT INTO skill_levels VALUES ('ski_blauer_koenig','BK'),('ski_adult_green','AG');
  INSERT INTO products(id,name,type,duration_minutes,season_id,discipline,is_active,show_on_website,min_age,max_age,pricing_type) VALUES
   ('00000000-0000-4000-8000-0000000000a4','Kinder 4h','group',240,'00000000-0000-4000-8000-000000000001','ski',true,true,4,16,'tiered'),
   ('00000000-0000-4000-8000-0000000000a2','Kinder 2h','group',120,'00000000-0000-4000-8000-000000000001','ski',true,true,4,16,'tiered'),
   ('00000000-0000-4000-8000-0000000000e4','Erwachsene 4h','group',240,'00000000-0000-4000-8000-000000000001','ski',true,true,17,99,'tiered'),
   ('00000000-0000-4000-8000-0000000000c2','Carving 2h','group',120,'00000000-0000-4000-8000-000000000001','ski',true,true,17,99,'tiered'),
   ('00000000-0000-4000-8000-0000000000ff','Kinder 4h inaktiv','group',240,'00000000-0000-4000-8000-000000000001','ski',false,true,4,16,'tiered'),
   ('00000000-0000-4000-8000-0000000000s2','x','group',120,'00000000-0000-4000-8000-000000000001','ski',true,true,4,16,'tiered')
   ON CONFLICT DO NOTHING;`.replace(",\n   ('00000000-0000-4000-8000-0000000000s2','x','group',120,'00000000-0000-4000-8000-000000000001','ski',true,true,4,16,'tiered')", ''));
  await sql.unsafe(`
  INSERT INTO products(id,name,type,duration_minutes,season_id,discipline,is_active,show_on_website,min_age,max_age) VALUES
   ('00000000-0000-4000-8000-0000000000b2','Samstag 2h','group',120,'00000000-0000-4000-8000-000000000001','ski',true,true,4,16),
   ('00000000-0000-4000-8000-0000000000p1','x','private',60,'00000000-0000-4000-8000-000000000001','ski',true,true,null,null)
   ON CONFLICT DO NOTHING;`.replace(",\n   ('00000000-0000-4000-8000-0000000000p1','x','private',60,'00000000-0000-4000-8000-000000000001','ski',true,true,null,null)", ''));
  await sql.unsafe(`
  INSERT INTO products(id,name,type,duration_minutes,season_id,discipline,is_active,show_on_website) VALUES
   ('00000000-0000-4000-8000-0000000000d1','Privat 1h','private',60,'00000000-0000-4000-8000-000000000001','ski',true,true);
  -- tiers + exact source tariffs (kids 4h: 1-5 days, kids 2h only 1 day, adults 1-5, Saturday 5)
  INSERT INTO product_price_tiers(product_id,day_count,cumulative_price)
   SELECT '00000000-0000-4000-8000-0000000000a4',d,100*d FROM generate_series(1,5) d
   UNION ALL SELECT '00000000-0000-4000-8000-0000000000a2',1,60
   UNION ALL SELECT '00000000-0000-4000-8000-0000000000e4',d,120*d FROM generate_series(1,5) d
   UNION ALL SELECT '00000000-0000-4000-8000-0000000000c2',1,99
   UNION ALL SELECT '00000000-0000-4000-8000-0000000000b2',4,240
   UNION ALL SELECT '00000000-0000-4000-8000-0000000000b2',5,290;
  INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
   SELECT 'k4-'||d,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a4','Gruppe','draft',d,240,1,100*d,'{"group_capacity":2}' FROM generate_series(1,5) d
   UNION ALL SELECT 'k2-1','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a2','Gruppe','draft',1,120,1,60,'{"group_capacity":2}'
   UNION ALL SELECT 'e4-'||d,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000e4','Gruppe','draft',d,240,1,120*d,'{"group_capacity":2}' FROM generate_series(1,5) d
   UNION ALL SELECT 'c2-1','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000c2','Carving','draft',1,120,1,99,'{"group_capacity":8}'
   UNION ALL SELECT 'sa-'||d,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000b2','Samstagkurs','draft',d,120,1,CASE d WHEN 4 THEN 240 ELSE 290 END,'{"group_capacity":2}' FROM generate_series(4,5) d
   UNION ALL SELECT 'p1-'||n,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000d1','Privat','draft',1,60,n,70+20*n,'{}' FROM generate_series(1,2) n;
  INSERT INTO instructors(id,status,roles) VALUES
   ('00000000-0000-4000-8000-00000000i001','active','{ski}'),('00000000-0000-4000-8000-00000000i002','active','{ski}');
  `.replaceAll('00000000i00', '0000000f00'));
  // courses, periods, instances (md5 ids exactly like the production course import)
  await sql.unsafe(`
  INSERT INTO group_courses(id,name,discipline,min_age,max_age,max_participants,is_active,course_type,skill_level_id,product_id) VALUES
   ('00000000-0000-4000-8000-0000000000c1','26/27 Ski BK','ski',4,16,2,false,'weekly','ski_blauer_koenig','00000000-0000-4000-8000-0000000000a4'),
   ('00000000-0000-4000-8000-0000000000c3','26/27 Ski Erwachsene','ski',17,99,2,false,'weekly','ski_adult_green','00000000-0000-4000-8000-0000000000e4'),
   ('00000000-0000-4000-8000-0000000000c5','26/27 Samstag Ski BK','ski',4,16,2,false,'saturday_course','ski_blauer_koenig','00000000-0000-4000-8000-0000000000b2');
  INSERT INTO training_groups(id,course_id,week_start,group_number,status) VALUES
   ('00000000-0000-4000-8000-0000000000g1','00000000-0000-4000-8000-0000000000c1','2027-01-04',1,'active'),
   ('00000000-0000-4000-8000-0000000000g3','00000000-0000-4000-8000-0000000000c3','2027-01-04',1,'active'),
   ('00000000-0000-4000-8000-0000000000g5','00000000-0000-4000-8000-0000000000c5','2027-01-04',1,'active');
  INSERT INTO bc_2627_course_period_sources VALUES
   ('weekday:2027-01-04:BK','00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000g1','sha',ARRAY['k4-1'],
     ARRAY['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08']::date[],
     '{"00000000-0000-4000-8000-0000000000a4":[1,2,3,4,5],"00000000-0000-4000-8000-0000000000a2":[1,2,3],"00000000-0000-4000-8000-0000000000ff":[1]}'),
   ('weekday:2027-01-04:AG','00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000g3','sha',ARRAY['e4-1'],
     ARRAY['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08']::date[],
     '{"00000000-0000-4000-8000-0000000000e4":[1,2,3,4,5],"00000000-0000-4000-8000-0000000000c2":[1]}'),
   ('saturday_series:2027-01-09:BK','00000000-0000-4000-8000-0000000000c5','00000000-0000-4000-8000-0000000000g5','sha',ARRAY['sa-5'],
     ARRAY['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06']::date[],
     '{"00000000-0000-4000-8000-0000000000b2":[4,5]}');
  INSERT INTO bc_2627_course_product_variants VALUES
   ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000a4','{1,2,3,4,5}'),
   ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000a2','{1,2,3}'),
   ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000ff','{1}'),
   ('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000e4','{1,2,3,4,5}'),
   ('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000c2','{1}'),
   ('00000000-0000-4000-8000-0000000000c5','00000000-0000-4000-8000-0000000000b2','{4,5}');
  INSERT INTO group_course_instances(id,course_id,date,start_time,end_time)
   SELECT md5('malbun-2627:instance:'||ps.source_key||':'||d::text||':'||b)::uuid, ps.course_id, d, split_part(b,'-',1)::time, split_part(b,'-',2)::time
     FROM bc_2627_course_period_sources ps, unnest(ps.teaching_dates) d,
          unnest(CASE WHEN ps.source_key LIKE 'saturday%' THEN ARRAY['10:00-12:00'] ELSE ARRAY['10:00-12:00','14:00-16:00'] END) b;
  INSERT INTO training_course_dates(training_id,date,is_cancelled)
   SELECT '00000000-0000-4000-8000-0000000000c5',d,d='2027-01-30' FROM unnest(ARRAY['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06']::date[]) d;
  `.replaceAll('0000000000g', '00000000a0g').replaceAll('00000000a0g1', '00000000a0b1').replaceAll('00000000a0g3', '00000000a0b3').replaceAll('00000000a0g5', '00000000a0b5'));

  const BK = 'weekday:2027-01-04:BK', AG = 'weekday:2027-01-04:AG', SA = 'saturday_series:2027-01-09:BK';
  const K4 = '00000000-0000-4000-8000-0000000000a4', K2 = '00000000-0000-4000-8000-0000000000a2', E4 = '00000000-0000-4000-8000-0000000000e4';
  const SAT = '00000000-0000-4000-8000-0000000000b2', PRIV = '00000000-0000-4000-8000-0000000000d1', CARV = '00000000-0000-4000-8000-0000000000c2';
  const INACTIVE = '00000000-0000-4000-8000-0000000000ff';
  const WEEK = ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'];
  const kid = (ref, birth = '2018-05-01') => ({ ref, birth_date: birth, discipline: 'ski', skill_level: 'ski_blauer_koenig' });
  const adult = (ref) => ({ ref, birth_date: '1985-03-03', discipline: 'ski', skill_level: 'ski_adult_green' });
  let n = 0;
  const key = () => `test-key-${++n}-${Date.now()}`;
  const reserve = async (payload) => (await sql`SELECT bc_2627_reserve(${sql.json(payload)}) r`)[0].r;
  const finalize = async (r, people) => (await sql`SELECT bc_2627_finalize(${r.ticket_id}, ${r.reservation_token},
      ${sql.json({ email: 'familie@example.invalid', first_name: 'Test', last_name: 'Familie' })}, ${sql.json(people)}) r`)[0].r;
  const issueInvoice = async (r) => (await sql`INSERT INTO invoices(invoice_number,ticket_id,subtotal,total,due_date,status)
      SELECT 'R-'||${r.ticket_number}, id, total_amount, total_amount, CURRENT_DATE+14, 'open' FROM tickets WHERE id=${r.ticket_id}
      ON CONFLICT DO NOTHING RETURNING id`);
  const confirm = async (r) => (await sql`SELECT bc_2627_confirm(${r.ticket_id}, ${r.reservation_token}) r`)[0].r;
  const named = (p) => ({ ...p, first_name: `P-${p.ref}`, last_name: 'Familie' });
  const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) t, (SELECT count(*)::int FROM ticket_items) i,
      (SELECT count(*)::int FROM bc_2627_reservations) r, (SELECT count(*)::int FROM group_course_enrollments) e`)[0];

  await t('options: only active, website, linked, tiered products; Carving informational; inactive/cancelled excluded', async () => {
    const o = (await sql`SELECT bc_2627_course_options('2027-01-01','2027-02-28') r`)[0].r;
    const ids = o.options.map((x) => `${x.period_key}|${x.product_id}`);
    assert.ok(ids.includes(`${BK}|${K4}`) && ids.includes(`${AG}|${E4}`) && ids.includes(`${SA}|${SAT}`));
    assert.ok(!ids.some((x) => x.endsWith(INACTIVE) || x.endsWith(CARV)), 'inactive/Carving must not be bookable');
    const k2 = o.options.find((x) => x.product_id === K2);
    assert.deepEqual(k2.tiers.map((x) => x.day_count), [1], 'only tiers with exact source');
    const sat = o.options.find((x) => x.product_id === SAT);
    assert.ok(!sat.teaching_dates.includes('2027-01-30') && sat.cancelled_dates.includes('2027-01-30'));
    assert.equal(o.options.find((x) => x.product_id === K4).blocks[0], '10:00-12:00+14:00-16:00');
    assert.equal(o.options.find((x) => x.product_id === K4).bookable, true);
  });

  let family;
  await t('family above planning threshold: different courses, one booking, one invoice, price once', async () => {
    // threshold is 2 per course; book 3 kids + 1 adult -> must succeed
    const people = [kid('a'), kid('b', '2016-02-02'), kid('c', '2020-12-31'), adult('m')];
    const r = await reserve({ idempotency_key: key(), participants: people, selections: [
      { participant_ref: 'a', period_key: BK, product_id: K4, dates: WEEK },
      { participant_ref: 'b', period_key: BK, product_id: K4, dates: WEEK },
      { participant_ref: 'c', period_key: BK, product_id: K4, dates: WEEK.slice(0, 3) },
      { participant_ref: 'm', period_key: AG, product_id: E4, dates: WEEK.slice(0, 2) },
    ] });
    assert.equal(r.status, 'success', JSON.stringify(r));
    assert.equal(Number(r.total_amount), 500 + 500 + 300 + 240);
    const items = await sql`SELECT * FROM ticket_items WHERE ticket_id=${r.ticket_id}`;
    assert.equal(items.length, 4, 'one priced line per participant selection');
    assert.ok(items.every((i) => i.instructor_id === null), 'no phantom group instructor');
    assert.equal(items.reduce((s, i) => s + Number(i.line_total), 0), 1540);
    const f = await finalize(r, people.map(named));
    assert.equal(f.status, 'success', JSON.stringify(f));
    await issueInvoice(r);
    const c = await confirm(r);
    assert.equal(c.status, 'success', JSON.stringify(c));
    assert.equal(c.enrollments_created, 10 + 10 + 6 + 4);
    const [inv] = await sql`SELECT count(*)::int n, sum(total) s FROM invoices WHERE ticket_id=${r.ticket_id}`;
    assert.equal(inv.n, 1); assert.equal(Number(inv.s), 1540);
    const over = await sql`SELECT current_participants FROM group_course_instances WHERE course_id='00000000-0000-4000-8000-0000000000c1' AND date='2027-01-04'`;
    assert.ok(over.every((x) => x.current_participants === 3), 'overflow counted accurately (3 > threshold 2)');
    family = r;
  });

  await t('idempotent retry: same key replays, no new ticket/items; changed body conflicts', async () => {
    const k = key();
    const payload = { idempotency_key: k, participants: [kid('x')], selections: [{ participant_ref: 'x', period_key: BK, product_id: K4, dates: WEEK.slice(0, 1) }] };
    const a = await reserve(payload);
    const before = await counts();
    const b = await reserve(payload);
    assert.equal(b.replayed, true); assert.equal(b.ticket_id, a.ticket_id);
    assert.deepEqual(await counts(), before);
    const c = await reserve({ ...payload, notes: 'other' });
    assert.equal(c.code, 'idempotency_conflict');
  });

  await t('confirm/invoice retries: one invoice, no duplicate enrollments', async () => {
    const again = await issueInvoice(family);
    assert.equal(again.length, 0, 'second open invoice blocked by unique index');
    const c = await confirm(family);
    assert.equal(c.already_confirmed, true);
    const [{ n }] = await sql`SELECT count(*)::int n FROM group_course_enrollments e JOIN ticket_items ti ON ti.id=e.ticket_item_id WHERE ti.ticket_id=${family.ticket_id}`;
    assert.equal(n, 30);
    const f = await finalize(family, []);
    assert.equal(f.already_finalized, true);
  });

  const rejects = async (name, payload, code) => t(name, async () => {
    const before = await counts();
    const r = await reserve({ idempotency_key: key(), ...payload });
    assert.equal(r.status, 'error', JSON.stringify(r));
    assert.equal(r.code, code, JSON.stringify(r));
    assert.deepEqual(await counts(), before, 'no writes on rejection');
  });
  await rejects('missing tier (2h kids 2 days) rejected', { participants: [kid('a')], selections: [{ participant_ref: 'a', period_key: BK, product_id: K2, dates: WEEK.slice(0, 2), block: '10:00-12:00' }] }, 'quote_rejected');
  await rejects('day count not allowed by course variant rejected', { participants: [kid('a')], selections: [{ participant_ref: 'a', period_key: BK, product_id: K2, dates: WEEK.slice(0, 4), block: '10:00-12:00' }] }, 'tier_unavailable');
  await rejects('invalid age at course date rejected', { participants: [kid('a', '2010-01-03')], selections: [{ participant_ref: 'a', period_key: BK, product_id: K4, dates: WEEK }] }, 'invalid_age');
  await rejects('wrong level rejected', { participants: [{ ...kid('a'), skill_level: 'ski_adult_green' }], selections: [{ participant_ref: 'a', period_key: BK, product_id: K4, dates: WEEK }] }, 'invalid_level');
  await rejects('date outside period rejected', { participants: [kid('a')], selections: [{ participant_ref: 'a', period_key: BK, product_id: K4, dates: ['2027-01-11'] }] }, 'invalid_dates');
  await rejects('duplicate dates rejected', { participants: [kid('a')], selections: [{ participant_ref: 'a', period_key: BK, product_id: K4, dates: ['2027-01-04', '2027-01-04'] }] }, 'invalid_dates');
  await rejects('inactive product fails closed', { participants: [kid('a')], selections: [{ participant_ref: 'a', period_key: BK, product_id: INACTIVE, dates: ['2027-01-04'] }] }, 'product_unavailable');
  await rejects('Carving not bookable', { participants: [adult('a')], selections: [{ participant_ref: 'a', period_key: AG, product_id: CARV, dates: ['2027-01-04'], block: '10:00-12:00' }] }, 'product_unavailable');
  await rejects('cancelled Saturday rejected', { participants: [kid('a')], selections: [{ participant_ref: 'a', period_key: SA, product_id: SAT, dates: ['2027-01-09', '2027-01-16', '2027-01-23', '2027-01-30'] }] }, 'invalid_dates');
  await rejects('mixed Saturday series rejected', { participants: [kid('a')], selections: [{ participant_ref: 'a', period_key: SA, product_id: SAT, dates: ['2027-01-09', '2027-01-16', '2027-01-23', '2027-02-20'] }] }, 'invalid_dates');
  await rejects('participant without selection rejected', { participants: [kid('a'), kid('b')], selections: [{ participant_ref: 'a', period_key: BK, product_id: K4, dates: WEEK }] }, 'invalid_selection');

  await t('partial 4h day (afternoon block missing) rejected, quote refuses half day', async () => {
    await sql`UPDATE group_course_instances SET status='cancelled' WHERE course_id='00000000-0000-4000-8000-0000000000c1' AND date='2027-01-08' AND start_time='14:00'`;
    const r = await reserve({ idempotency_key: key(), participants: [kid('a')], selections: [{ participant_ref: 'a', period_key: BK, product_id: K4, dates: ['2027-01-08'] }] });
    assert.equal(r.code, 'invalid_dates', JSON.stringify(r));
    await sql`UPDATE group_course_instances SET status='scheduled' WHERE course_id='00000000-0000-4000-8000-0000000000c1' AND date='2027-01-08'`;
    await assert.rejects(sql`SELECT quote_bc_2627_product(${K4}, ${sql.json([{ date: '2027-01-08', time_start: '10:00', time_end: '12:00' }])}, 1)`);
  });

  await t('Saturday series of 4 valid dates books and enrolls 4 instances', async () => {
    const r = await reserve({ idempotency_key: key(), participants: [kid('s')], selections: [{ participant_ref: 's', period_key: SA, product_id: SAT, dates: ['2027-01-09', '2027-01-16', '2027-01-23', '2027-02-06'] }] });
    assert.equal(r.status, 'success', JSON.stringify(r)); assert.equal(Number(r.total_amount), 240);
    await finalize(r, [named(kid('s'))]); await issueInvoice(r);
    assert.equal((await confirm(r)).enrollments_created, 4);
  });

  await t('concurrent above-threshold group bookings all succeed and counts stay exact', async () => {
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => reserve({ idempotency_key: key(), participants: [kid(`k${i}`)],
      selections: [{ participant_ref: `k${i}`, period_key: BK, product_id: K4, dates: ['2027-01-06'] }] })));
    assert.ok(rs.every((r) => r.status === 'success'), JSON.stringify(rs.find((r) => r.status !== 'success')));
    await Promise.all(rs.map(async (r, i) => { await finalize(r, [named(kid(`k${i}`))]); await issueInvoice(r); await confirm(r); }));
    const rows = await sql`SELECT gi.current_participants cp, (SELECT count(*)::int FROM group_course_enrollments e WHERE e.instance_id=gi.id) n
      FROM group_course_instances gi WHERE course_id='00000000-0000-4000-8000-0000000000c1' AND date='2027-01-06'`;
    assert.ok(rows.every((x) => x.cp === x.n && x.n === 15), JSON.stringify(rows)); // 3 family + 12
  });

  await t('concurrent identical retries create exactly one booking', async () => {
    const payload = { idempotency_key: key(), participants: [kid('z')], selections: [{ participant_ref: 'z', period_key: BK, product_id: K4, dates: ['2027-01-07'] }] };
    const rs = await Promise.all(Array.from({ length: 6 }, () => reserve(payload)));
    assert.equal(new Set(rs.map((r) => r.ticket_id)).size, 1);
    assert.equal(rs.filter((r) => !r.replayed).length, 1);
  });

  await t('private: one consistent instructor; overlap locked under concurrency; unavailable rejected', async () => {
    const pp = (i, items) => ({ idempotency_key: key(), participants: [kid(`p${i}`)], selections: [{ kind: 'private', product_id: PRIV, participant_refs: [`p${i}`], items }] });
    const slot = [{ date: '2027-01-12', time_start: '10:00', time_end: '11:00' }];
    const rs = await Promise.all([0, 1, 2].map((i) => reserve(pp(i, slot))));
    const ok = rs.filter((r) => r.status === 'success');
    assert.equal(ok.length, 2, JSON.stringify(rs)); assert.equal(rs.find((r) => r.status !== 'success').code, 'slot_unavailable');
    const ins = await sql`SELECT DISTINCT instructor_id FROM ticket_items WHERE ticket_id = ANY(${ok.map((r) => r.ticket_id)})`;
    assert.equal(ins.length, 2, 'two different instructors, no overlap');
    // instructor 1 absent on 13th: two-day booking must use instructor 2 for both days
    await sql`INSERT INTO instructor_absences(instructor_id,start_date,end_date,status,is_full_day) VALUES ('00000000-0000-4000-8000-0000000f001','2027-01-13','2027-01-13','approved',true)`;
    const two = await reserve(pp(9, [{ date: '2027-01-14', time_start: '10:00', time_end: '11:00' }, { date: '2027-01-13', time_start: '10:00', time_end: '11:00' }]));
    assert.equal(two.status, 'success', JSON.stringify(two));
    const tw = await sql`SELECT DISTINCT instructor_id::text FROM ticket_items WHERE ticket_id=${two.ticket_id}`;
    assert.deepEqual(tw.map((x) => x.instructor_id), ['00000000-0000-4000-8000-0000000f002']);
    await sql`INSERT INTO instructor_absences(instructor_id,start_date,end_date,status,is_full_day) VALUES ('00000000-0000-4000-8000-0000000f002','2027-01-15','2027-01-15','approved',true),('00000000-0000-4000-8000-0000000f001','2027-01-15','2027-01-15','approved',true)`;
    const before = await counts();
    const none = await reserve(pp(8, [{ date: '2027-01-15', time_start: '10:00', time_end: '11:00' }]));
    assert.equal(none.code, 'slot_unavailable'); assert.deepEqual(await counts(), before);
  });

  await t('expired hold releases (finalize refused); cancellation releases only own enrollments', async () => {
    const r = await reserve({ idempotency_key: key(), participants: [kid('e')], selections: [{ participant_ref: 'e', period_key: BK, product_id: K4, dates: ['2027-01-05'] }] });
    await sql`UPDATE tickets SET reservation_expires_at=now()-interval '1 minute' WHERE id=${r.ticket_id}`;
    assert.equal((await finalize(r, [named(kid('e'))])).code, 'expired');
    assert.equal((await sql`SELECT bc_2627_release(${r.ticket_id}) r`)[0].r.status, 'success');
    assert.equal((await sql`SELECT status FROM tickets WHERE id=${r.ticket_id}`)[0].status, 'expired');
    const [{ cp: before }] = await sql`SELECT current_participants cp FROM group_course_instances WHERE id=md5('malbun-2627:instance:'||${BK}||':2027-01-04:10:00-12:00')::uuid`;
    await sql`UPDATE tickets SET status='cancelled' WHERE id=${family.ticket_id}`;
    const rel = (await sql`SELECT bc_2627_release(${family.ticket_id}) r`)[0].r;
    assert.equal(rel.enrollments_released, 30);
    const [{ cp: after }] = await sql`SELECT current_participants cp FROM group_course_instances WHERE id=md5('malbun-2627:instance:'||${BK}||':2027-01-04:10:00-12:00')::uuid`;
    assert.equal(before - after, 3);
  });

  await t('quote snapshot is immutable; finalize rejects changed birth date', async () => {
    await assert.rejects(sql`UPDATE bc_2627_reservations SET quote_snapshot='{}'`);
    const r = await reserve({ idempotency_key: key(), participants: [kid('q')], selections: [{ participant_ref: 'q', period_key: BK, product_id: K4, dates: ['2027-01-05'] }] });
    const f = await finalize(r, [{ ...named(kid('q')), birth_date: '2009-01-01' }]);
    assert.equal(f.code, 'participant_mismatch');
  });

  await t('legacy compatibility: quote still prices private by source; group has no capacity cap', async () => {
    const q = (await sql`SELECT quote_bc_2627_product(${PRIV}, ${sql.json([{ date: '2027-01-12', time_start: '12:00', time_end: '13:00' }])}, 2) r`)[0].r;
    assert.equal(Number(q.total_amount), 110);
    const g = (await sql`SELECT quote_bc_2627_product(${K4}, ${sql.json([{ date: '2027-01-04', time_start: '10:00', time_end: '12:00' }, { date: '2027-01-04', time_start: '14:00', time_end: '16:00' }])}, 9) r`)[0].r;
    assert.equal(Number(g.total_amount), 900, '9 > source group_capacity 2 still quotes');
    await assert.rejects(sql`SELECT quote_bc_2627_product(${PRIV}, ${sql.json([{ date: '2027-01-12', time_start: '12:00', time_end: '13:00' }])}, 6)`);
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
}
console.log(results.join('\n'));
console.log(`${passed}/${results.length} passed`);
if (passed !== results.length) process.exit(1);
