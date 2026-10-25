// B07-P2 real SQL tests: product tariff resolver -> quote -> create with the configured same-day
// discount rule, equal-share allocation for shared lessons, explicit manual override, and the
// controlled move/edit transition guard. Throwaway local PostgreSQL only; all amounts are fixture DATA.
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/b07DiscountPricing.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `b07_discount_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 4 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), P = id(0xa0), Q = id(0xa1), ACTOR = id(0xbeef), CUST = id(0xc1);
const ANNA = id(0xe1), BEN = id(0xe2), I1 = id(0xf001), I2 = id(0xf002), I3 = id(0xf003);
const D1 = '2026-12-14', D2 = '2026-12-15';
const n2 = (x) => Math.round(Number(x) * 100) / 100;

// Decided Malbun values as configuration rows (same rows as the reviewed PROPOSED seed).
const r = (o) => ({ max_persons: 4, max_block_minutes: null, office_only: false, provenance: 'fixture = PROPOSED seed', ...o });
const MALBUN = [
  r({ rule_kind: 'hourly', window_start: '09:00', window_end: '10:00', price_chf: 75, extra_person_chf: 20 }),
  r({ rule_kind: 'hourly', window_start: '12:00', window_end: '14:00', price_chf: 75, extra_person_chf: 20 }),
  r({ rule_kind: 'hourly', window_start: '10:00', window_end: '12:00', price_chf: 85, extra_person_chf: 20, max_block_minutes: 60, office_only: true }),
  r({ rule_kind: 'hourly', window_start: '14:00', window_end: '16:00', price_chf: 85, extra_person_chf: 20, max_block_minutes: 60, office_only: true }),
  r({ rule_kind: 'exact_block', window_start: '10:00', window_end: '12:00', price_chf: 190, extra_person_chf: 40 }),
  r({ rule_kind: 'exact_block', window_start: '14:00', window_end: '16:00', price_chf: 190, extra_person_chf: 40 }),
  r({ rule_kind: 'exact_block', window_start: '12:00', window_end: '14:00', price_chf: 150, extra_person_chf: 40 }),
  r({ rule_kind: 'exact_block', window_start: '09:00', window_end: '11:00', price_chf: 160, extra_person_chf: 40, office_only: true }),
  r({ rule_kind: 'exact_block', window_start: '13:00', window_end: '15:00', price_chf: 160, extra_person_chf: 40, office_only: true }),
];

// B07-P3: creates must name the participant/day context they were quoted on (tests compute the current one).
const withCtx = async (p) => {
  if ('day_context_digest' in p) return p;
  const ids = (p.participants ?? []).filter((x) => x.participant_id).map((x) => x.participant_id);
  const dates = [...new Set((p.appointments ?? []).map((a) => a.date).filter(Boolean))];
  const [{ d }] = await sql`SELECT pa_private_day_context(${ids}::uuid[], ${dates}::date[])->>'digest' d`;
  return { ...p, day_context_digest: d };
};

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/pa_assign_later.sql',
    'supabase/pending/course_archive_delete.sql', 'supabase/pending/bc_2627_staff_group_booking.sql',
    'supabase/pending/bc_2627_staff_group_booking_v2.sql', 'supabase/pending/staff_booking_finalize.sql',
    'supabase/pending/staff_guest_level.sql', 'drizzle/migrations/0024_product_private_tariff_rules.sql']) {
    const res = psqlFile(f); if (res.status !== 0) throw new Error(`psql ${f}: ${res.stderr}`);
  }
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-25' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES
      ('${P}','Privat Ski','private',120,0,'${S}',true),('${Q}','Privat Snowboard','private',120,0,'${S}',true);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ('${I1}','A','Eins','active','{ski}'),('${I2}','B','Zwei','active','{ski}'),('${I3}','C','Drei','active','{ski}');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('08:00','17:00',80);
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES
      ('${ANNA}','${CUST}','Anna','Synth','2010-02-02'),('${BEN}','${CUST}','Ben','Synth','2012-03-03');
    INSERT INTO private_lesson_discount_rule(percent,threshold_minutes,provenance) VALUES (10,240,'fixture = PROPOSED seed');
  `);
  const save = async (product, expected, rules) => (await sql`SELECT save_product_private_tariff_rules(${product}::uuid, ${expected}::int, ${sql.json(rules)}::jsonb, ${ACTOR}::uuid) r`)[0].r;
  assert.equal((await save(P, 0, MALBUN)).revision, 1);
  assert.equal((await save(Q, 0, MALBUN)).revision, 1);

  const slot = (date, s, e, ins = I1) => ({ date, time_start: s, time_end: e, instructor_id: ins });
  const quote = async (product, appts, persons = 1, extra = {}) =>
    (await sql`SELECT pa_create_quote(${sql.json({ product_id: product, persons, appointments: appts, ...extra })}::jsonb) r`)[0].r;
  const priced = async (slots, intent = { mode: 'automatic' }) =>
    (await sql`SELECT pa_price_request(${P}::uuid, ${sql.json(slots)}::jsonb, ${sql.json(intent)}::jsonb, true) r`)[0].r;
  let k = 0; const key = () => `b07p2-${++k}-${Date.now()}`;
  const create = async (appts, more = {}, participants = [{ participant_id: ANNA }]) => (await sql`SELECT pa_create_booking_finalized(${sql.json(await withCtx({
    submission_key: key(), customer_id: CUST, product_id: P, appointments: appts, participants, quote_revision: 1, discount_rule_revision: 1, ...more,
  }))}::jsonb, ${ACTOR}::uuid) r`)[0].r;

  await t('grants: new helpers service-only; new tables SELECT-only for authenticated, none for anon', async () => {
    for (const f of ['pa_same_day_discount(jsonb,numeric,integer)', 'pa_discount_intent(jsonb,boolean)', 'pa_price_request(uuid,jsonb,jsonb,boolean)']) {
      for (const role of ['anon', 'authenticated']) assert.equal((await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`)[0].ok, false, `${role} ${f}`);
      assert.equal((await sql`SELECT has_function_privilege('service_role', ${'public.' + f}, 'EXECUTE') ok`)[0].ok, true);
    }
    for (const tb of ['private_lesson_discount_rule', 'private_appointment_pricing']) {
      const [x] = await sql`SELECT has_table_privilege('authenticated', ${'public.' + tb}, 'SELECT') s, has_table_privilege('authenticated', ${'public.' + tb}, 'INSERT') i, has_table_privilege('anon', ${'public.' + tb}, 'SELECT') a`;
      assert.deepEqual([x.s, x.i, x.a], [true, false, false], tb);
    }
  });

  await t('decided standard + exception blocks resolve from configuration (190/190/150/160/160/75/85, +40 double, +20 hourly)', async () => {
    const q = await quote(P, [slot(D1, '10:00', '12:00'), slot(D1, '14:00', '16:00'), slot(D2, '12:00', '14:00')]);
    assert.deepEqual(q.items.map((x) => Number(x.price)), [190, 190, 150]);
    const ex = await quote(P, [slot(D2, '09:00', '11:00'), slot('2026-12-16', '13:00', '15:00'), slot('2026-12-17', '09:00', '10:00'), slot('2026-12-18', '10:00', '11:00')]);
    assert.deepEqual(ex.items.map((x) => Number(x.price)), [160, 160, 75, 85]);
    const two = await quote(P, [slot(D1, '10:00', '12:00'), slot(D2, '09:00', '10:00')], 2);
    assert.deepEqual(two.items.map((x) => Number(x.price)), [230, 95]);
    const pub = (await sql`SELECT pa_product_quote(${P}, ${D1}, '09:00', '11:00', 1, false) r`)[0].r;
    assert.equal(pub.reason, 'office_only'); // exceptions are not opened for public booking
  });

  await t('Anna 4h/Ben 2h: shared 2h 230 => 115 each, discount 11.50 => 218.50; Anna solo 2h gets her full 10%', async () => {
    const res = await priced([
      { date: D1, time_start: '10:00', time_end: '12:00', participants: [ANNA, BEN] },
      { date: D1, time_start: '14:00', time_end: '16:00', participants: [ANNA] },
    ]);
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(res.items.map((x) => [Number(x.price), n2(x.discount_amount), n2(x.net), x.eligible, x.persons]), [[230, 11.5, 218.5, 1, 2], [190, 19, 171, 1, 1]]);
    assert.equal(Number(res.discount_total), 30.5); assert.equal(n2(res.total), 389.5);
  });

  await t('participant order and slot order do not change the result', async () => {
    const a = await priced([{ date: D1, time_start: '10:00', time_end: '12:00', participants: [ANNA, BEN] }, { date: D1, time_start: '14:00', time_end: '16:00', participants: [ANNA] }]);
    const b = await priced([{ date: D1, time_start: '14:00', time_end: '16:00', participants: [ANNA] }, { date: D1, time_start: '10:00', time_end: '12:00', participants: [BEN, ANNA] }]);
    assert.equal(n2(a.total), n2(b.total)); assert.equal(Number(a.discount_total), Number(b.discount_total));
    assert.equal(n2(b.items[1].discount_amount), 11.5);
  });

  await t('all eligible / none eligible / different dates / 2 people x 2h never pooled', async () => {
    const all = await priced([{ date: D1, time_start: '10:00', time_end: '12:00', participants: [ANNA, BEN] }, { date: D1, time_start: '14:00', time_end: '16:00', participants: [ANNA, BEN] }]);
    assert.deepEqual(all.items.map((x) => n2(x.discount_amount)), [23, 23]);
    const none = await priced([{ date: D1, time_start: '10:00', time_end: '12:00', participants: [ANNA, BEN] }]);
    assert.equal(Number(none.discount_total), 0); assert.equal(none.discount_source, 'none');
    const days = await priced([{ date: D1, time_start: '10:00', time_end: '12:00', participants: [ANNA] }, { date: D2, time_start: '10:00', time_end: '12:00', participants: [ANNA] }]);
    assert.equal(Number(days.discount_total), 0);
    // Two double lessons = 240 planned clock minutes (not 230 effective): eligible.
    const exact = await priced([{ date: D2, time_start: '10:00', time_end: '12:00', participants: [BEN] }, { date: D2, time_start: '12:00', time_end: '14:00', participants: [BEN] }]);
    assert.equal(Number(exact.discount_total), 34);
  });

  await t('manual override replaces automatic (lower/higher/explicit 0), never added; legacy default 0 stays automatic', async () => {
    const appts = [slot(D1, '10:00', '12:00'), slot(D1, '14:00', '16:00')];
    const auto = await quote(P, appts); assert.equal(Number(auto.discount_total), 38); assert.equal(auto.discount_source, 'automatic');
    const low = await quote(P, appts, 1, { discount_override: { percent: 5 } });
    assert.equal(Number(low.discount_total), 19); assert.equal(low.discount_source, 'manual'); assert.equal(Number(low.automatic_discount_total), 38);
    const high = await quote(P, appts, 1, { discount_override: { percent: 20 } }); assert.equal(Number(high.discount_total), 76);
    const zero = await quote(P, appts, 1, { discount_override: { percent: 0 } }); assert.equal(Number(zero.discount_total), 0); assert.equal(zero.discount_source, 'manual');
    const legacyDefault = await quote(P, appts, 1, { discount_percent: 0 }); assert.equal(legacyDefault.discount_source, 'automatic');
    const cleared = await quote(P, appts, 1, { discount_override: null }); assert.equal(Number(cleared.discount_total), 38);
    const both = await quote(P, appts, 1, { discount_override: { percent: 5 }, discount_percent: 7 }); assert.equal(both.field, 'discount_override');
  });

  let autoTicket, autoIds;
  await t('create: stored lines/total equal the quote; automatic reason + provenance rows; history names the source', async () => {
    const appts = [slot(D1, '10:00', '12:00', I2), slot(D1, '14:00', '16:00', I2)];
    const q = await quote(P, appts);
    const c = await create(appts);
    assert.equal(c.ok, true, JSON.stringify(c)); autoTicket = c.ticket_id; autoIds = c.appointment_ids;
    assert.equal(n2(c.total), n2(q.total)); assert.equal(n2(c.total), 342); assert.equal(c.discount_source, 'automatic');
    const lines = await sql`SELECT unit_price, discount_percent, discount_reason, line_total FROM ticket_items WHERE ticket_id=${autoTicket} ORDER BY time_start`;
    assert.deepEqual(lines.map((x) => [Number(x.unit_price), Number(x.discount_percent), n2(x.line_total)]), [[190, 10, 171], [190, 10, 171]]);
    assert.match(lines[0].discount_reason, /^Automatischer Tagesrabatt 10% \(ab 240 Min\./);
    const prov = await sql`SELECT discount_source, discount_amount, eligible_persons FROM private_appointment_pricing WHERE appointment_id = ANY(${autoIds}::uuid[])`;
    assert.deepEqual(prov.map((x) => [x.discount_source, Number(x.discount_amount), x.eligible_persons]), [['automatic', 19, 1], ['automatic', 19, 1]]);
    const [h] = await sql`SELECT details FROM ticket_history WHERE ticket_id=${autoTicket} AND event_type='PRIVATE_APPOINTMENT_CHANGED'`;
    assert.equal(h.details.discount_source, 'automatic'); assert.equal(Number(h.details.discount_total), 38); assert.equal(Number(h.details.discount_percent), 0);
  });

  await t('create: explicit 0 override stored distinguishable (reason kept, source manual); reason required', async () => {
    const appts = [slot(D2, '10:00', '12:00', I3), slot(D2, '14:00', '16:00', I3)];
    assert.equal((await create(appts, { discount_override: { percent: 0 } })).field, 'discount_reason');
    const c = await create(appts, { discount_override: { percent: 0, reason: 'Kein Rabatt vereinbart' } });
    assert.equal(n2(c.total), 380); assert.equal(c.discount_source, 'manual');
    const lines = await sql`SELECT discount_percent, discount_reason FROM ticket_items WHERE ticket_id=${c.ticket_id}`;
    assert.ok(lines.every((x) => Number(x.discount_percent) === 0 && x.discount_reason === 'Kein Rabatt vereinbart'));
    const prov = await sql`SELECT DISTINCT discount_source FROM private_appointment_pricing p JOIN private_appointments a ON a.id=p.appointment_id WHERE a.ticket_id=${c.ticket_id}`;
    assert.deepEqual(prov.map((x) => x.discount_source), ['manual']);
  });

  await t('unmodified single-item default: one 1h lesson, no discount, discount_percent 0 + NULL reason', async () => {
    const c = await create([slot('2026-12-20', '09:00', '10:00', I1)]);
    assert.equal(n2(c.total), 75); assert.equal(c.discount_source, 'none');
    const [l] = await sql`SELECT discount_percent, discount_reason FROM ticket_items WHERE ticket_id=${c.ticket_id}`;
    assert.equal(Number(l.discount_percent), 0); assert.equal(l.discount_reason, null);
  });

  await t('rule revision: changing configured percent changes quotes without code; stale create => quote_changed, nothing written; history unchanged', async () => {
    const before = (await sql`SELECT count(*)::int n FROM tickets`)[0].n;
    await sql`UPDATE private_lesson_discount_rule SET percent = 15, provenance = 'fixture B'`;
    const appts = [slot('2026-12-21', '10:00', '12:00', I1), slot('2026-12-21', '14:00', '16:00', I1)];
    const q = await quote(P, appts); assert.equal(q.discount_rule_revision, 2); assert.equal(Number(q.discount_total), 57);
    const stale = await create(appts); assert.equal(stale.error, 'quote_changed'); assert.equal(stale.quote.discount_rule_revision, 2);
    assert.equal((await sql`SELECT count(*)::int n FROM tickets`)[0].n, before);
    const [{ total_amount }] = await sql`SELECT total_amount FROM tickets WHERE id=${autoTicket}`;
    assert.equal(n2(total_amount), 342); // earlier booking keeps its stored discount
    const ok = await create(appts, { discount_rule_revision: 2 }); assert.equal(n2(ok.total), 323);
    await sql`UPDATE private_lesson_discount_rule SET percent = 10, provenance = 'fixture = PROPOSED seed'`; // rev 3
  });

  await t('product price revision: tariff edit requotes; old quote_revision rejected', async () => {
    await save(Q, 1, MALBUN.map((x) => (x.rule_kind === 'exact_block' && x.window_start === '10:00' ? { ...x, price_chf: 200 } : x)));
    const q = await quote(Q, [slot('2026-12-22', '10:00', '12:00')]); assert.equal(q.revision, 2); assert.equal(Number(q.total), 200);
    const c = (await sql`SELECT pa_create_booking(${sql.json(await withCtx({ submission_key: key(), customer_id: CUST, product_id: Q, quote_revision: 1, discount_rule_revision: 3,
      appointments: [slot('2026-12-22', '10:00', '12:00', I1)], participants: [{ participant_id: ANNA }] }))}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(c.error, 'quote_changed');
  });

  await t('controlled transition: tariffed appointment refuses time move / participant change / price write; teacher-only change keeps price', async () => {
    const before = await sql`SELECT a.id, a.price, ti.unit_price, ti.discount_percent FROM private_appointments a JOIN ticket_items ti ON ti.appointment_id=a.id WHERE a.ticket_id=${autoTicket} ORDER BY a.time_start`;
    await assert.rejects(sql`SELECT pa_move_appointment(${before[0].id}::uuid, ${D1}::date, '09:00'::time, '11:00'::time, ${I2}::uuid, ${ACTOR}::uuid)`, (e) => e.code === 'YT001');
    await assert.rejects(sql`INSERT INTO private_appointment_participants(appointment_id, participant_id) VALUES (${before[0].id}, ${BEN})`, (e) => e.code === 'YT001');
    await assert.rejects(sql`UPDATE ticket_items SET discount_percent = 0 WHERE appointment_id = ${before[0].id}`, (e) => e.code === 'YT001');
    const mv = (await sql`SELECT pa_move_appointment(${before[0].id}::uuid, ${D1}::date, '10:00'::time, '12:00'::time, ${I3}::uuid, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(mv.ok, true, JSON.stringify(mv)); assert.equal(Number(mv.price), 190);
    const after = await sql`SELECT a.price, ti.unit_price, ti.discount_percent, ti.instructor_id FROM private_appointments a JOIN ticket_items ti ON ti.appointment_id=a.id WHERE a.id=${before[0].id}`;
    assert.deepEqual([Number(after[0].price), Number(after[0].unit_price), Number(after[0].discount_percent), after[0].instructor_id], [190, 190, 10, I3]);
    const [{ total_amount }] = await sql`SELECT total_amount FROM tickets WHERE id=${autoTicket}`; assert.equal(n2(total_amount), 342);
  });

  await t('legacy appointment (no pricing row) keeps legacy pa_price move behaviour', async () => {
    const [tk] = await sql`INSERT INTO tickets(ticket_number,customer_id,status,total_amount,paid_amount) VALUES ('T-LEG-1',${CUST},'confirmed',160,0) RETURNING id`;
    const [ap] = await sql`INSERT INTO private_appointments(ticket_id,date,time_start,time_end,instructor_id,status,instructor_confirmation,price) VALUES (${tk.id},'2026-12-23','09:00','11:00',${I1},'booked','pending',160) RETURNING id`;
    await sql`INSERT INTO private_appointment_participants(appointment_id,participant_id) VALUES (${ap.id},${ANNA})`;
    await sql`INSERT INTO ticket_items(ticket_id,product_id,date,time_start,time_end,instructor_id,instructor_confirmation,unit_price,quantity,item_type,appointment_id) VALUES (${tk.id},${P},'2026-12-23','09:00','11:00',${I1},'pending',160,1,'private',${ap.id})`;
    const mv = (await sql`SELECT pa_move_appointment(${ap.id}::uuid, '2026-12-23'::date, '13:00'::time, '14:00'::time, ${I1}::uuid, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(mv.ok, true, JSON.stringify(mv)); assert.equal(Number(mv.price), 80); // legacy global rate, unchanged path
  });
} finally {
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  await sql.end(); await admin.unsafe(`DROP DATABASE ${dbName}`); await admin.end();
}
if (passed !== results.length || results.length === 0) process.exit(1);
