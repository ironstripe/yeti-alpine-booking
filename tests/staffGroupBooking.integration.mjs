// Real SQL tests for supabase/pending/bc_2627_staff_group_booking.sql (staff atomic group booking).
// Throwaway local PostgreSQL only: schema-only production baseline + pending SQL + synthetic data.
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres PGSSLMODE=disable bun tests/staffGroupBooking.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `staff_group_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0; const results = [];
async function t(name, fn) {
  try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), S_OLD = id(9), P4 = id(2), P2 = id(3), P_OLD = id(4), ACTOR = id(0xbeef), CUST = id(0xc1), CUST2 = id(0xc2);
const PA = id(0xa1), PB = id(0xa2), PC = id(0xa3), PX = id(0xa9);
const C_NOMP = id(0x150), LUNCH = id(0x5), C_CONC = id(0x160);
const C_BLUE = id(0x100), C_RED = id(0x110), C_INACTIVE = id(0x120), C_SB = id(0x130), C_OLD = id(0x140);
const WEEK = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'];
const XMAS = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25'];
const TIERS4 = [150, 200, 245, 285, 320];
const book = (p) => sql`SELECT public.bc_2627_staff_group_book(${sql.json(p)}::jsonb, ${ACTOR}::uuid) r`.then((x) => x[0].r);
const options = (dates, sport) => sql`SELECT public.bc_2627_staff_group_options(${dates}::date[], ${sport}) r`.then((x) => x[0].r);
const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) tickets, (SELECT count(*)::int FROM ticket_items) items,
  (SELECT count(*)::int FROM group_course_enrollments) enr, (SELECT count(*)::int FROM customer_participants) parts,
  (SELECT coalesce(sum(current_participants),0)::int FROM group_course_instances) seats`)[0];
const line = (o) => ({ course_id: C_BLUE, product_id: P4, dates: WEEK, sport: 'ski', ...o });
let keyN = 0; const key = () => `test-key-${++keyN}-${Date.now()}`;

async function seedCourse(cid, name, { mp = 'Täli', discipline = 'ski', active = true, dates = [...WEEK, ...XMAS], pmOnly = false, product = P4, variants = [[P4, [1, 2, 3, 4, 5]], [P2, [1]]] } = {}) {
  await sql`INSERT INTO group_courses(id,name,discipline,min_age,max_age,price_per_day,is_active,product_id,course_type,meeting_point,skill_level_id,max_participants)
    VALUES (${cid},${name},${discipline},4,16,0,${active},${product},'weekly',${mp},NULL,2)`;
  for (const d of dates) {
    const slots = pmOnly ? [['14:00', '16:00']] : [['10:00', '12:00'], ['14:00', '16:00']];
    for (const [a, b] of slots) await sql`INSERT INTO group_course_instances(course_id,date,start_time,end_time,status,current_participants) VALUES (${cid},${d},${a},${b},'scheduled',0)`;
  }
  for (const [p, dc] of variants) await sql`INSERT INTO bc_2627_course_product_variants(course_id,product_id,eligible_day_counts) VALUES (${cid},${p},${dc})`;
  const tg = (await sql`INSERT INTO training_groups(course_id,week_start,status) VALUES (${cid},'2026-12-14','active') RETURNING id`)[0].id;
  await sql`INSERT INTO bc_2627_course_period_sources(source_key,course_id,training_group_id,source_sha256,tariff_source_ids,teaching_dates,eligible_variants)
    VALUES (${'weekday:2026-12-14:' + name},${cid},${tg},'sha','{}',${WEEK}::date[],'{}')`;
}

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/course_archive_delete.sql', 'supabase/pending/bc_2627_staff_group_booking.sql', 'supabase/pending/bc_2627_staff_group_booking_v2.sql', 'supabase/pending/staff_booking_finalize.sql']) {
    const r = psqlFile(f); if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15'),('${S_OLD}','Winter 25/26','2025-12-01','2026-04-06');
    INSERT INTO products(id,name,type,price,season_id,is_active,duration_minutes) VALUES
      ('${P4}','26/27 Kinder Ganztag','group',0,'${S}',true,240),('${P2}','26/27 Kinder 2h','group',0,'${S}',true,120),('${P_OLD}','Alt','group',0,'${S_OLD}',true,240);
    INSERT INTO customers(id,first_name,last_name,email,customer_number) VALUES ('${CUST}','Test','Kunde','t1@example.invalid','K-T1'),('${CUST2}','Andere','Kundin','t2@example.invalid','K-T2');
    INSERT INTO customer_participants(id,customer_id,first_name,birth_date) VALUES ('${PA}','${CUST}','Anna','2016-01-01'),('${PB}','${CUST}','Ben','2017-01-01'),('${PC}','${CUST}','Cleo','2018-01-01'),('${PX}','${CUST2}','Fremd','2015-01-01');
  `);
  for (let d = 1; d <= 5; d++) {
    await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES (${P4},${d},${TIERS4[d - 1]})`;
    await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
      VALUES (${'src-4h-' + d},${S},${P4},'sha','Kinderkurs','draft',${d},240,1,${TIERS4[d - 1]},'{"group_capacity":2}')`;
  }
  await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES (${P2},1,70)`;
  await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
    VALUES ('src-2h-1',${S},${P2},'sha','Kinderkurs','draft',1,120,1,70,'{"group_capacity":2}')`;
  await seedCourse(C_BLUE, 'Ski Blauer König');
  await seedCourse(C_RED, 'Ski Roter Prinz');
  await seedCourse(C_INACTIVE, 'Ski Inaktiv', { active: false });
  await seedCourse(C_SB, 'Snowboard Kids', { discipline: 'snowboard' });
  await seedCourse(C_NOMP, 'Ski Ohne Treffpunkt', { mp: null });
  await seedCourse(C_CONC, 'Ski Parallel');
  await sql`INSERT INTO products(id,name,type,price,season_id,is_active) VALUES (${LUNCH},'Mittagsbetreuung','lunch',30,${S_OLD},true)`;
  await seedCourse(C_OLD, 'Alt 25/26', { product: P_OLD, variants: [[P_OLD, [5]]] });

  await t('options: 14-18 Dec ski lists active 26/27 courses with exact quote, every AM/PM block, no inactive/snowboard/wrong-season', async () => {
    const o = await options(WEEK, 'ski');
    const ids = o.map((x) => x.course_id);
    assert.deepEqual([...new Set(ids)].sort(), [C_BLUE, C_RED, C_NOMP, C_CONC].sort());
    const blue = o.find((x) => x.course_id === C_BLUE && x.product_id === P4);
    assert.equal(Number(blue.unit_price), 320);
    assert.equal(blue.blocks.length, 10);
    assert.deepEqual(blue.blocks.slice(0, 2).map((b) => `${b.date} ${b.time_start}-${b.time_end}`), ['2026-12-14 10:00-12:00', '2026-12-14 14:00-16:00']);
    assert.ok(!o.some((x) => x.product_id === P2), '2h variant only for 1 day');
    assert.deepEqual((await options(WEEK, 'snowboard')).map((x) => x.course_id), [C_SB]);
  });
  await t('options: 21-25 Dec shape and one-day 2h AM/PM variants', async () => {
    assert.equal((await options(XMAS, 'ski')).find((x) => x.course_id === C_BLUE).blocks.length, 10);
    const one = (await options(['2026-12-15'], 'ski')).filter((x) => x.course_id === C_BLUE);
    assert.deepEqual(one.map((x) => `${x.duration_minutes}:${x.block}:${x.unit_price}`).sort(), ['120:am:70', '120:pm:70', '240:null:150'].sort());
  });

  await t('book: 3 participants (over source capacity 2), two courses, total = quote, package not multiplied per block, every block enrolled once', async () => {
    const before = await counts();
    const r = await book({ submission_key: key(), customer_id: CUST, lines: [
      line({ participant_id: PA, expected_unit_price: 320 }),
      line({ participant_id: PB }),
      line({ participant_id: PC, course_id: C_RED }),
    ] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(Number(r.total), 960);
    const items = await sql`SELECT * FROM ticket_items WHERE ticket_id=${r.ticket_id} ORDER BY participant_id`;
    assert.equal(items.length, 3);
    for (const it of items) {
      assert.equal(Number(it.unit_price), 320); assert.equal(it.quantity, 1); assert.equal(Number(it.line_total), 320);
      assert.equal(it.item_type, 'group'); assert.equal(it.date.toISOString?.().slice(0, 10) ?? String(it.date), '2026-12-14');
    }
    const enr = await sql`SELECT e.participant_id, count(*)::int n, count(DISTINCT e.instance_id)::int d, count(e.training_group_id)::int tg
      FROM group_course_enrollments e JOIN ticket_items ti ON ti.id=e.ticket_item_id WHERE ti.ticket_id=${r.ticket_id} GROUP BY 1`;
    assert.equal(enr.length, 3);
    for (const x of enr) { assert.equal(x.n, 10); assert.equal(x.d, 10); assert.equal(x.tg, 10); }
    const after = await counts();
    assert.equal(after.enr - before.enr, 30); assert.equal(after.seats - before.seats, 30);
    const tk = (await sql`SELECT * FROM tickets WHERE id=${r.ticket_id}`)[0];
    assert.equal(Number(tk.total_amount), 960); assert.equal(Number(tk.paid_amount), 0); assert.equal(tk.status, 'confirmed'); assert.equal(tk.participant_count, 3);
  });

  await t('book: new participant created explicitly (no name matching), 2h AM single day', async () => {
    const before = await counts();
    const r = await book({ submission_key: key(), customer_id: CUST, lines: [
      { course_id: C_BLUE, product_id: P2, dates: ['2026-12-21'], block: 'am', guest: { guest_key: 'g1', first_name: 'Anna', birth_date: '2016-01-01' } },
    ] });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(Number(r.total), 70);
    const after = await counts(); assert.equal(after.parts - before.parts, 1); assert.equal(after.enr - before.enr, 1);
  });

  await t('idempotent retry and concurrent duplicate submit create exactly one booking', async () => {
    const k = key(); const p = { submission_key: k, customer_id: CUST, lines: [line({ participant_id: PA, dates: XMAS })] };
    const before = await counts();
    const [a, b] = await Promise.all([book(p), book(p)]);
    const c = await book(p);
    assert.equal(a.ticket_id, b.ticket_id); assert.equal(a.ticket_id, c.ticket_id);
    assert.ok([a, b, c].filter((x) => x.replayed).length >= 2);
    const after = await counts(); assert.equal(after.tickets - before.tickets, 1); assert.equal(after.enr - before.enr, 10);
  });

  const rejects = async (name, payload, field) => t(name, async () => {
    const before = await counts();
    const r = await book({ submission_key: key(), customer_id: CUST, ...payload });
    assert.equal(r.ok, undefined, JSON.stringify(r)); assert.equal(r.field, field, JSON.stringify(r));
    assert.deepEqual(await counts(), before);
  });
  await rejects('rollback: valid first line + invalid second line persists nothing', { lines: [line({ participant_id: PB, dates: XMAS }), line({ participant_id: PC, course_id: C_INACTIVE })] }, 'course');
  await rejects('inactive course rejected', { lines: [line({ participant_id: PB, course_id: C_INACTIVE })] }, 'course');
  await rejects('wrong season product rejected', { lines: [line({ participant_id: PB, course_id: C_OLD, product_id: P_OLD })] }, 'course');
  await rejects('wrong discipline rejected', { lines: [line({ participant_id: PB, course_id: C_SB })] }, 'course');
  await rejects('unknown course id rejected', { lines: [line({ participant_id: PB, course_id: id(0xdead) })] }, 'course');
  await rejects('participant of another customer rejected', { lines: [line({ participant_id: PX })] }, 'participant');
  await rejects('unknown participant rejected', { lines: [line({ participant_id: id(0xdead) })] }, 'participant');
  await rejects('already enrolled participant rejected', { lines: [line({ participant_id: PA })] }, 'already_enrolled');
  await rejects('duplicate participant+course in one request rejected', { lines: [line({ participant_id: PB, dates: XMAS }), line({ participant_id: PB, dates: XMAS })] }, 'duplicate');
  await rejects('dates outside eligible day counts / not one week rejected', { lines: [line({ participant_id: PC, dates: ['2026-12-18', '2026-12-21'] })] }, 'tariff');
  await rejects('missing block for 2h product rejected', { lines: [line({ participant_id: PB, product_id: P2, dates: ['2026-12-21'] })] }, 'blocks');
  await rejects('summary price drift rejected (expected_unit_price)', { lines: [line({ participant_id: PB, dates: XMAS, expected_unit_price: 300 })] }, 'price_changed');
  await t('source drift: tier no longer matches source tariff -> rejected, nothing written', async () => {
    await sql`UPDATE product_price_tiers SET cumulative_price=999 WHERE product_id=${P4} AND day_count=5`;
    try {
      const before = await counts();
      const r = await book({ submission_key: key(), customer_id: CUST, lines: [line({ participant_id: PB, dates: XMAS })] });
      assert.equal(r.field, 'tariff', JSON.stringify(r)); assert.deepEqual(await counts(), before);
      assert.ok(!(await options(XMAS, 'ski')).some((x) => x.product_id === P4), 'no fallback option');
    } finally { await sql`UPDATE product_price_tiers SET cumulative_price=320 WHERE product_id=${P4} AND day_count=5`; }
  });
  await t('quote: group sales unlimited (7 persons over capacity 2 = 7 x exact tier), one call per group', async () => {
    const items = WEEK.flatMap((d) => [{ date: d, time_start: '10:00', time_end: '12:00' }, { date: d, time_start: '14:00', time_end: '16:00' }]);
    const q = (await sql`SELECT public.quote_bc_2627_product(${P4}::uuid, ${sql.json(items)}::jsonb, 7) r`)[0].r;
    assert.equal(Number(q.total_amount), 7 * TIERS4[4]); assert.equal(q.participant_count, 7);
  });
  await t('book: 3 participants same course+week priced by ONE group quote (unit = tier)', async () => {
    const r = await book({ submission_key: key(), customer_id: CUST2, lines: [1, 2, 3].map((n) => line({ course_id: C_RED, dates: XMAS, guest: { guest_key: 'g' + n, first_name: 'Q' + n, birth_date: '2018-01-01' } })) });
    assert.ok(r.ok, JSON.stringify(r)); assert.equal(Number(r.total), 3 * TIERS4[4]);
    const it = await sql`SELECT DISTINCT unit_price FROM ticket_items WHERE ticket_id=${r.ticket_id}`; assert.equal(it.length, 1); assert.equal(Number(it[0].unit_price), TIERS4[4]);
  });
  const nomp = (o) => line({ course_id: C_NOMP, dates: XMAS, ...o });
  await t('meeting point: course without point requires explicit catalog value; nothing written otherwise', async () => {
    const before = await counts();
    assert.equal((await book({ submission_key: key(), customer_id: CUST, lines: [nomp({ participant_id: PA })] })).field, 'meeting_point');
    assert.equal((await book({ submission_key: key(), customer_id: CUST, lines: [nomp({ participant_id: PA, meeting_point: 'Irgendwo' })] })).field, 'meeting_point');
    assert.deepEqual(await counts(), before);
    const r = await book({ submission_key: key(), customer_id: CUST, lines: [nomp({ participant_id: PA, meeting_point: 'malbipark' })] });
    assert.ok(r.ok, JSON.stringify(r));
    const it = await sql`SELECT meeting_point FROM ticket_items WHERE ticket_id=${r.ticket_id}`; assert.equal(it[0].meeting_point, 'malbipark');
    assert.equal((await sql`SELECT meeting_point FROM group_courses WHERE id=${C_NOMP}`)[0].meeting_point, null, 'course not changed');
  });
  await t('meeting point: course value authoritative, differing explicit value rejected, equal accepted', async () => {
    assert.equal((await book({ submission_key: key(), customer_id: CUST2, lines: [line({ course_id: C_BLUE, dates: XMAS, guest: { guest_key: 'm1', first_name: 'M', birth_date: '2018-01-01' }, meeting_point: 'malbipark' })] })).field, 'meeting_point');
    const r = await book({ submission_key: key(), customer_id: CUST2, lines: [line({ course_id: C_BLUE, dates: XMAS, guest: { guest_key: 'm1', first_name: 'M', birth_date: '2018-01-01' }, meeting_point: 'Täli' })] });
    assert.ok(r.ok, JSON.stringify(r)); assert.equal((await sql`SELECT meeting_point FROM ticket_items WHERE ticket_id=${r.ticket_id}`)[0].meeting_point, 'Täli');
  });
  await t('lunch: per participant days + vegetarian, priced from lunch product, total = package + lunch, replay adds nothing', async () => {
    const k = key();
    const p = { submission_key: k, customer_id: CUST2, lines: [
      line({ course_id: C_RED, dates: WEEK, guest: { guest_key: 'l1', first_name: 'L1', birth_date: '2018-01-01' }, lunch_dates: ['2026-12-15', '2026-12-14', '2026-12-17'], vegetarian: true, expected_lunch_unit_price: 30 }),
      line({ course_id: C_RED, dates: WEEK, guest: { guest_key: 'l2', first_name: 'L2', birth_date: '2018-01-01' } }),
    ] };
    const r = await book(p); assert.ok(r.ok, JSON.stringify(r));
    assert.equal(Number(r.total), 2 * 320 + 3 * 30);
    const l = await sql`SELECT ti.date::text d, ti.is_vegetarian v, ti.unit_price, cp.first_name FROM ticket_items ti JOIN customer_participants cp ON cp.id=ti.participant_id WHERE ticket_id=${r.ticket_id} AND item_type='lunch' ORDER BY 1`;
    assert.deepEqual(l.map((x) => `${x.first_name}:${x.d}:${x.v}:${Number(x.unit_price)}`), ['L1:2026-12-14:true:30', 'L1:2026-12-15:true:30', 'L1:2026-12-17:true:30']);
    const g = await sql`SELECT cp.first_name, ti.is_vegetarian FROM ticket_items ti JOIN customer_participants cp ON cp.id=ti.participant_id WHERE ticket_id=${r.ticket_id} AND item_type='group' ORDER BY 1`;
    assert.deepEqual(g.map((x) => `${x.first_name}:${x.is_vegetarian}`), ['L1:true', 'L2:false']);
    const before = await counts(); const again = await book(p); assert.equal(again.replayed, true); assert.deepEqual(await counts(), before);
  });
  await t('lunch: day outside course dates, or price drift, rejected without writes', async () => {
    const before = await counts();
    const g = { guest_key: 'lx', first_name: 'LX', birth_date: '2018-01-01' };
    assert.equal((await book({ submission_key: key(), customer_id: CUST2, lines: [line({ course_id: C_RED, dates: XMAS, guest: g, lunch_dates: ['2026-12-14'] })] })).field, 'lunch');
    assert.equal((await book({ submission_key: key(), customer_id: CUST2, lines: [line({ course_id: C_RED, dates: XMAS, guest: g, lunch_dates: ['2026-12-21'], expected_lunch_unit_price: 25 })] })).field, 'lunch_price_changed');
    assert.deepEqual(await counts(), before);
  });
  await t('concurrency: two sessions, different keys + participants, same AM/PM instances -> both succeed once, seats exact, no deadlock', async () => {
    const seats0 = (await sql`SELECT sum(current_participants)::int s FROM group_course_instances WHERE course_id=${C_CONC}`)[0].s;
    const mk = (n) => ({ submission_key: key(), customer_id: CUST2, lines: [line({ course_id: C_CONC, dates: WEEK, guest: { guest_key: 'c' + n, first_name: 'C' + n, birth_date: '2018-01-01' } }), line({ course_id: C_CONC, dates: WEEK, guest: { guest_key: 'd' + n, first_name: 'D' + n, birth_date: '2018-01-01' } })] });
    const slow = (p) => sql.begin(async (tx) => { const r = (await tx`SELECT public.bc_2627_staff_group_book(${tx.json(p)}::jsonb, ${ACTOR}::uuid) r`)[0].r; await tx`SELECT pg_sleep(0.4)`; return r; });
    const rs = await Promise.all([slow(mk(1)), slow(mk(2)), book(mk(3)), book(mk(4))]);
    for (const r of rs) assert.ok(r.ok, JSON.stringify(r));
    assert.equal(new Set(rs.map((r) => r.ticket_id)).size, 4);
    const seats1 = (await sql`SELECT sum(current_participants)::int s FROM group_course_instances WHERE course_id=${C_CONC}`)[0].s;
    assert.equal(seats1 - seats0, 8 * 10);
    const enr = (await sql`SELECT count(*)::int n FROM group_course_enrollments e JOIN group_course_instances i ON i.id=e.instance_id WHERE i.course_id=${C_CONC}`)[0].n;
    assert.equal(enr, seats1);
  });
  await t('concurrency: same participant, different keys, concurrently -> exactly one enrollment set, other rolled back', async () => {
    const before = await counts();
    const mk = () => ({ submission_key: key(), customer_id: CUST, lines: [line({ course_id: C_CONC, dates: XMAS, participant_id: PB })] });
    const slow = (p) => sql.begin(async (tx) => { const r = (await tx`SELECT public.bc_2627_staff_group_book(${tx.json(p)}::jsonb, ${ACTOR}::uuid) r`)[0].r; await tx`SELECT pg_sleep(0.4)`; return r; });
    const rs = await Promise.all([slow(mk()), slow(mk())]);
    assert.equal(rs.filter((r) => r.ok).length, 1, JSON.stringify(rs));
    assert.equal(rs.find((r) => !r.ok).field, 'already_enrolled');
    const after = await counts();
    assert.equal(after.tickets - before.tickets, 1); assert.equal(after.enr - before.enr, 10); assert.equal(after.seats - before.seats, 10);
  });
  await t('stale snapshot: instance moved while booking waits on lock -> blocks rejected, nothing written', async () => {
    const inst = (await sql`SELECT id FROM group_course_instances WHERE course_id=${C_CONC} AND date='2026-12-22' AND start_time='14:00'`)[0].id;
    const before = await counts();
    let release; const gate = new Promise((r) => { release = r; });
    const mover = sql.begin(async (tx) => { await tx`UPDATE group_course_instances SET start_time='14:30' WHERE id=${inst}`; await gate; });
    await new Promise((r) => setTimeout(r, 150));
    const pending = book({ submission_key: key(), customer_id: CUST, lines: [line({ course_id: C_CONC, dates: XMAS, participant_id: PC })] });
    await new Promise((r) => setTimeout(r, 300)); release(); await mover;
    const r = await pending;
    assert.equal(r.field, 'blocks', JSON.stringify(r)); assert.deepEqual(await counts(), before);
    await sql`UPDATE group_course_instances SET start_time='14:00' WHERE id=${inst}`;
  });
  await t('roles: anon/authenticated cannot execute; service_role can', async () => {
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(sql.begin(async (tx) => { await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx.unsafe(`SELECT public.bc_2627_staff_group_book('{}'::jsonb, NULL)`); }), /permission denied/);
      await assert.rejects(sql.begin(async (tx) => { await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx.unsafe(`SELECT public.bc_2627_staff_group_options('{2026-12-14}'::date[], 'ski')`); }), /permission denied/);
      await assert.rejects(sql.begin(async (tx) => { await tx.unsafe(`SET LOCAL ROLE ${role}`); await tx.unsafe(`SELECT * FROM bc_2627_staff_group_submissions`); }), /permission denied/);
    }
    const ok = await sql.begin(async (tx) => { await tx.unsafe('SET LOCAL ROLE service_role'); return tx.unsafe(`SELECT has_function_privilege('service_role','public.bc_2627_staff_group_book(jsonb,uuid)','EXECUTE') x`); });
    assert.equal(ok[0].x, true);
  });
  await t('rollback script removes functions and keeps submissions table', async () => {
    const r = psqlFile('supabase/pending/bc_2627_staff_group_booking_rollback.sql'); assert.equal(r.status, 0, r.stderr);
    const f = await sql`SELECT count(*)::int n FROM pg_proc WHERE proname LIKE 'bc_2627_staff_group%'`; assert.equal(f[0].n, 0);
    assert.ok((await sql`SELECT to_regclass('public.bc_2627_staff_group_submissions') x`)[0].x);
    const items = WEEK.flatMap((d) => [{ date: d, time_start: '10:00', time_end: '12:00' }, { date: d, time_start: '14:00', time_end: '16:00' }]);
    await assert.rejects(sql`SELECT public.quote_bc_2627_product(${P4}::uuid, ${sql.json(items)}::jsonb, 3)`, /capacity/);
  });
} finally {
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  await sql.end(); await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin.end();
  process.exitCode = passed === results.length && results.length > 0 ? 0 : 1;
}
