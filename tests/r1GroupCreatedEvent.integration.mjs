// R1 (S2 group final audit) SQL tests; setup derived from b07aMultiCreate.integration.mjs.
// B07a real SQL tests: atomic multi-item office booking with ALL pending B01-B11 prerequisites + B07-P + L1
// installed together (production baseline + every drizzle migration 0000-0015 + pending chain), plus the
// two L1 fixes (participant UPDATE guard, period_update stale target locks).
// Throwaway local PostgreSQL only (synthetic data).
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/b07aMultiCreate.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `r1g_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

const CHAIN = ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql',
  ...readdirSync(fileURLToPath(new URL('drizzle/migrations/', root))).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) < 16 /* promoted release steps listed explicitly below */).sort().map((f) => `drizzle/migrations/${f}`),
  'drizzle/migrations/0016_b04_delivery_compatibility.sql', 'drizzle/migrations/0017_b06_invoice_delivery.sql', 'drizzle/migrations/0018_b11_created_total_event.sql',
  'drizzle/migrations/0019_participant_birth_date_guard.sql', 'drizzle/migrations/0020_group_lunch_full_day.sql', 'drizzle/migrations/0021_group_lunch_season.sql',
  'drizzle/migrations/0022_pa_edit_booking.sql', 'drizzle/migrations/0023_b05_office_confirmation_intent.sql',
  'drizzle/migrations/0024_product_private_tariff_rules.sql', 'drizzle/migrations/0025_pa_tariff_l1.sql', 'drizzle/migrations/0026_b07a_office_multi_create.sql', 'supabase/pending/r1_group_created_total_event.sql'];

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), PSKI = id(0xa0), PSB = id(0xa1), P4 = id(0xa4), LUNCH = id(0xa5), ACTOR = id(0xbeef), NOROLE = id(0xbad);
const CUST = id(0xc1), CUST2 = id(0xc2), ANNA = id(0xe1), BEN = id(0xe2), CARL = id(0xe3), DORA = id(0xe4), HOTEL = id(0xb0);
const C_NOMP = id(0x150), C_SB = id(0x130);
const I = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => id(0xf000 + n));
const WEEK = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'];
const n2 = (x) => Math.round(Number(x) * 100) / 100;
const r = (o) => ({ max_persons: 4, max_block_minutes: null, office_only: false, provenance: 'fixture = PROPOSED seed', ...o });
const MALBUN = [
  r({ rule_kind: 'hourly', window_start: '09:00', window_end: '10:00', price_chf: 75, extra_person_chf: 20 }),
  r({ rule_kind: 'hourly', window_start: '12:00', window_end: '14:00', price_chf: 75, extra_person_chf: 20 }),
  r({ rule_kind: 'hourly', window_start: '16:00', window_end: '17:00', price_chf: 75, extra_person_chf: 20 }),
  r({ rule_kind: 'hourly', window_start: '10:00', window_end: '12:00', price_chf: 85, extra_person_chf: 20, max_block_minutes: 60, office_only: true }),
  r({ rule_kind: 'hourly', window_start: '14:00', window_end: '16:00', price_chf: 85, extra_person_chf: 20, max_block_minutes: 60, office_only: true }),
  r({ rule_kind: 'exact_block', window_start: '10:00', window_end: '12:00', price_chf: 190, extra_person_chf: 40 }),
  r({ rule_kind: 'exact_block', window_start: '14:00', window_end: '16:00', price_chf: 190, extra_person_chf: 40 }),
  r({ rule_kind: 'exact_block', window_start: '12:00', window_end: '14:00', price_chf: 150, extra_person_chf: 40 }),
  r({ rule_kind: 'exact_block', window_start: '09:00', window_end: '11:00', price_chf: 160, extra_person_chf: 40, office_only: true }),
  r({ rule_kind: 'exact_block', window_start: '13:00', window_end: '15:00', price_chf: 160, extra_person_chf: 40, office_only: true }),
];

try {
  for (const f of CHAIN) { const res = psqlFile(f); if (res.status !== 0) throw new Error(`psql ${f}: ${res.stderr}`); }
  results.push(`     installed together: ${CHAIN.length} files`);
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-25' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid'),('${NOROLE}','nobody@example.invalid');
    INSERT INTO user_roles(user_id, role) VALUES ('${ACTOR}','office');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES
      ('${PSKI}','Privat Ski','private',120,0,'${S}',true),('${PSB}','Privat Snowboard','private',120,0,'${S}',true),
      ('${P4}','26/27 Kinder Ganztag','group',240,0,'${S}',true),('${LUNCH}','Mittagsbetreuung','lunch',NULL,30,'${S}',true);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ${I.map((x, n) => `('${x}','L${n}','Synth','active','{ski}')`).join(',')};
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid'),('${CUST2}','Synth','Zwei','k2@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES
      ('${ANNA}','${CUST}','Anna','Synth','2016-02-02'),('${BEN}','${CUST}','Ben','Synth','2017-03-03'),
      ('${CARL}','${CUST}','Carl','Synth','2015-04-04'),('${DORA}','${CUST2}','Dora','Synth','2016-05-05');
    INSERT INTO private_lesson_discount_rule(percent,threshold_minutes,provenance) VALUES (10,240,'fixture = PROPOSED seed');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('09:00','17:00',80);
    INSERT INTO billing_partners(id,name) VALUES ('${HOTEL}','Hotel Synth');
  `);
  for (const P of [PSKI, PSB]) await sql`SELECT save_product_private_tariff_rules(${P}::uuid, 0, ${sql.json(MALBUN)}::jsonb, ${ACTOR}::uuid)`;
  const TIERS = [150, 200, 245, 285, 320];
  for (let d = 1; d <= 5; d++) {
    await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES (${P4},${d},${TIERS[d - 1]})`;
    await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
      VALUES (${'src-4h-' + d},${S},${P4},'sha','Kinderkurs','draft',${d},240,1,${TIERS[d - 1]},'{"group_capacity":2}')`;
  }
  for (const [cid, name, disc, mp] of [[C_NOMP, 'Ski Ohne Treffpunkt', 'ski', null], [C_SB, 'Snowboard Kids', 'snowboard', 'Täli']]) {
    await sql`INSERT INTO group_courses(id,name,discipline,min_age,max_age,price_per_day,is_active,product_id,course_type,meeting_point,max_participants)
      VALUES (${cid},${name},${disc},4,16,0,true,${P4},'weekly',${mp},8)`;
    for (const d of WEEK) for (const [a, b] of [['10:00', '12:00'], ['14:00', '16:00']])
      await sql`INSERT INTO group_course_instances(course_id,date,start_time,end_time,status,current_participants) VALUES (${cid},${d},${a},${b},'scheduled',0)`;
    await sql`INSERT INTO bc_2627_course_product_variants(course_id,product_id,eligible_day_counts) VALUES (${cid},${P4},${[1, 2, 3, 4, 5]})`;
  }

  // ---- helpers
  let k = 0; const key = () => `b07a-${++k}-${Date.now()}`;
  const multi = async (p, mode, db = sql, actor = ACTOR) => (await db`SELECT b07a_office_multi(${sql.json(p)}::jsonb, ${actor}::uuid, ${mode}) r`)[0].r;
  const ack = async (p, db = sql) => {
    const q = await multi(p, 'quote', db); assert.equal(q.ok, true, JSON.stringify(q));
    return { ...p, acknowledged_quote_digest: q.quote.quote_digest, confirmation_requested: p.confirmation_requested ?? false };
  };
  const book = async (p) => { const c = await multi(await ack(p), 'create'); assert.equal(c.ok, true, JSON.stringify(c)); return c; };
  const known = (ref, pid) => ({ ref, participant_id: pid });
  const priv = (product, parts, appts, more = {}) => ({ kind: 'private', product_id: product, participants: parts, appointments: appts, ...more });
  const ap = (date, s, e, ins, more = {}) => ({ date, time_start: s, time_end: e, instructor_id: ins, ...more });
  const gline = (o) => ({ course_id: C_NOMP, product_id: P4, dates: WEEK, block: null, sport: 'ski', meeting_point: 'malbipark', ...o });
  const base = (participants, items, more = {}) => ({ submission_key: key(), customer_id: CUST, participants, items,
    finalization: { payment_method: 'invoice', settlement: 'pay_later', payment_due_date: '2026-12-01', actor_name: 'office' }, ...more });
  const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) tk, (SELECT count(*)::int FROM ticket_items) ti,
    (SELECT count(*)::int FROM private_appointments) pa, (SELECT count(*)::int FROM private_appointment_participants) pap,
    (SELECT count(*)::int FROM private_appointment_pricing) pr, (SELECT count(*)::int FROM customer_participants) cp,
    (SELECT count(*)::int FROM group_course_enrollments) en, (SELECT coalesce(sum(current_participants),0)::int FROM group_course_instances) cur,
    (SELECT count(*)::int FROM payments) pay, (SELECT count(*)::int FROM ticket_comments) com,
    (SELECT count(*)::int FROM office_booking_confirmation_intents) oi, (SELECT count(*)::int FROM b07a_office_submissions) sub,
    (SELECT count(*)::int FROM ticket_history) h, (SELECT count(*)::int FROM notification_queue) nq,
    (SELECT count(*)::int FROM action_tasks) at, (SELECT coalesce(max(last_number),0)::int FROM ticket_number_counters) num`)[0];
  const ticket = async (tk) => (await sql`SELECT * FROM tickets WHERE id = ${tk}`)[0];
  const lines = async (tk) => sql`SELECT ti.*, pr.discount_source, pr.eligible_persons, pr.product_id pr_product
    FROM ticket_items ti LEFT JOIN private_appointment_pricing pr ON pr.appointment_id = ti.appointment_id WHERE ti.ticket_id = ${tk} ORDER BY ti.date, ti.time_start, ti.item_type`;


  const hist = async (tk) => sql`SELECT event_type, details FROM ticket_history WHERE ticket_id = ${tk} ORDER BY created_at, id`;
  const single = async (body) => (await sql`SELECT bc_2627_staff_group_book(${sql.json(body)}::jsonb, ${ACTOR}::uuid) r`)[0].r;

  await t('single group booking: one GROUP_BOOKING_CREATED with the final total, before PAYMENT_RECORDED', async () => {
    const r = await single({ submission_key: key(), customer_id: CUST, lines: [{ ...gline({ dates: WEEK.slice(0, 2) }), participant_id: CARL }],
      finalization: { payment_method: 'cash', settlement: 'paid_now', actor_name: 'office' } });
    assert.equal(r.ok, true, JSON.stringify(r));
    const h = await hist(r.ticket_id); const total = n2((await ticket(r.ticket_id)).total_amount);
    const ev = h.filter((x) => x.event_type === 'GROUP_BOOKING_CREATED');
    assert.equal(ev.length, 1); assert.ok(total > 0); assert.equal(n2(ev[0].details.ticket_total_after_create), total);
    const types = h.map((x) => x.event_type);
    const pay = types.indexOf('PAYMENT_RECORDED');
    if (pay >= 0) assert.ok(types.indexOf('GROUP_BOOKING_CREATED') < pay, types.join(','));
  });
  await t('replay of the same single group submission adds no second event', async () => {
    const body = { submission_key: key(), customer_id: CUST, lines: [{ ...gline({ dates: WEEK.slice(2, 3) }), participant_id: CARL }] };
    const a = await single(body); assert.equal(a.ok, true, JSON.stringify(a));
    const b = await single(body); assert.equal(b.replayed, true); assert.equal(b.ticket_id, a.ticket_id);
    assert.equal((await hist(a.ticket_id)).filter((x) => x.event_type === 'GROUP_BOOKING_CREATED').length, 1);
  });
  await t('group-only multi cart: exactly one event with the whole booking total (no intermediate subtotal)', async () => {
    const c = await book(base([known('a', CARL), known('b', BEN)], [{ kind: 'group', lines: [gline({ participant: 'a', dates: WEEK.slice(3) })] },
      { kind: 'group', lines: [gline({ participant: 'b', course_id: C_SB, sport: 'snowboard', meeting_point: null, dates: WEEK.slice(3) })] }]));
    const ev = (await hist(c.ticket_id)).filter((x) => x.event_type === 'GROUP_BOOKING_CREATED');
    assert.equal(ev.length, 1); assert.equal(ev[0].details.multi_item, true);
    assert.equal(n2(ev[0].details.ticket_total_after_create), n2((await ticket(c.ticket_id)).total_amount));
  });
  await t('group+private multi cart: no group event; the private created event carries the whole total', async () => {
    const c = await book(base([known('a', ANNA), known('c', CARL)], [priv(PSKI, ['a'], [ap('2027-01-12', '12:00', '14:00', I[1])]),
      { kind: 'group', lines: [gline({ participant: 'c', dates: ['2026-12-18'] })] }]));
    const h = await hist(c.ticket_id);
    assert.equal(h.filter((x) => x.event_type === 'GROUP_BOOKING_CREATED').length, 0);
    const cr = h.find((x) => x.event_type === 'PRIVATE_APPOINTMENT_CHANGED' && x.details.change === 'created');
    assert.equal(n2(cr.details.ticket_total_after_create), n2((await ticket(c.ticket_id)).total_amount));
  });
  await t('quote dry run writes no history', async () => {
    const before = (await counts()).h;
    await multi(base([known('a', CARL)], [{ kind: 'group', lines: [gline({ participant: 'a', dates: WEEK.slice(4) })] }]), 'quote');
    assert.equal((await counts()).h, before);
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length - 1} passed`);
  if (passed !== results.length - 1) process.exitCode = 1;
}
