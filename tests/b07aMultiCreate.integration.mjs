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
const dbName = `b07a_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

export const CHAIN = ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql',
  ...readdirSync(fileURLToPath(new URL('drizzle/migrations/', root))).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort().map((f) => `drizzle/migrations/${f}`),
  'supabase/pending/b04_delivery_compatibility.sql', 'supabase/pending/b06_invoice_delivery.sql', 'supabase/pending/b11_created_total_event.sql',
  'supabase/pending/participant_birth_date_guard.sql', 'supabase/pending/group_lunch_full_day.sql', 'supabase/pending/group_lunch_season.sql',
  'supabase/pending/pa_edit_booking.sql', 'supabase/pending/b05_office_confirmation_intent.sql',
  'supabase/pending/product_private_tariff_rules.sql', 'supabase/pending/pa_tariff_l1.sql', 'supabase/pending/b07a_office_multi_create.sql'];

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

  await t('grants: b07a_office_multi and the submissions table are service-only', async () => {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await sql`SELECT has_function_privilege(${role}, 'public.b07a_office_multi(jsonb,uuid,text)', 'EXECUTE') ok`)[0].ok, false, role);
      assert.equal((await sql`SELECT has_table_privilege(${role}, 'public.b07a_office_submissions', 'SELECT') ok`)[0].ok, false, role);
    }
    assert.equal((await sql`SELECT has_function_privilege('service_role', 'public.b07a_office_multi(jsonb,uuid,text)', 'EXECUTE') ok`)[0].ok, true);
    const p = base([known('a', ANNA)], [priv(PSKI, ['a'], [ap('2026-12-21', '10:00', '12:00', I[0])])]);
    assert.equal((await multi(p, 'quote', sql, NOROLE)).error, 'forbidden');
  });

  await t('quote is a pure dry run: nothing written, ticket counter unchanged', async () => {
    const before = await counts();
    const q = await multi(base([known('a', ANNA), { ref: 'g', guest: { first_name: 'Gast', birth_date: '2016-01-01', level: null } }],
      [priv(PSKI, ['a'], [ap('2026-12-21', '10:00', '12:00', I[0])]), { kind: 'group', lines: [gline({ participant: 'g' })] }]), 'quote');
    assert.equal(q.ok, true, JSON.stringify(q)); assert.match(q.quote.quote_digest, /^[0-9a-f]{32}$/);
    assert.deepEqual(await counts(), before);
  });

  await t('private+private across products: one ticket, Anna 4h same day => 10% on both, order-independent', async () => {
    const items = [priv(PSKI, ['a'], [ap('2026-12-21', '10:00', '12:00', I[0])]), priv(PSB, ['a'], [ap('2026-12-21', '14:00', '16:00', I[1])])];
    const q1 = await multi(base([known('a', ANNA)], items), 'quote');
    const q2 = await multi(base([known('a', ANNA)], [items[1], items[0]]), 'quote');
    assert.equal(n2(q1.quote.total), 342); assert.equal(n2(q2.quote.total), 342);
    const nets = (q) => q.quote.private.map((x) => `${x.time_start}:${n2(x.net)}:${x.eligible}`).sort();
    assert.deepEqual(nets(q1), nets(q2));
    const before = await counts();
    const c = await book(base([known('a', ANNA)], items));
    const after = await counts(); assert.equal(after.tk - before.tk, 1); assert.equal(after.pa - before.pa, 2); assert.equal(after.oi - before.oi, 1);
    const ls = await lines(c.ticket_id); assert.deepEqual(ls.map((l) => l.pr_product), [PSKI, PSB]);
    assert.deepEqual(ls.map((l) => [n2(l.line_total), l.discount_source]), [[171, 'automatic'], [171, 'automatic']]);
    const tk = await ticket(c.ticket_id); assert.equal(n2(tk.total_amount), 342); assert.equal(tk.participant_count, 1);
    assert.equal(String(tk.payment_due_date.toISOString().slice(0, 10)), '2026-12-01');
    const ev = await sql`SELECT details FROM ticket_history WHERE ticket_id = ${c.ticket_id} AND event_type = 'PRIVATE_APPOINTMENT_CHANGED'`;
    assert.equal(ev.length, 1); assert.equal(n2(ev[0].details.ticket_total_after_create), 342); assert.equal(ev[0].details.appointment_ids.length, 2);
  });

  await t('per-person partial rebate Anna/Ben: shared 10-12 gets 1 of 2 eligible (218.50), Anna 14-16 171', async () => {
    const c = await book(base([known('a', ANNA), known('b', BEN)], [
      priv(PSKI, ['a', 'b'], [ap('2026-12-22', '10:00', '12:00', I[0])]), priv(PSB, ['a'], [ap('2026-12-22', '14:00', '16:00', I[1])])]));
    const ls = await lines(c.ticket_id);
    assert.deepEqual(ls.map((l) => [n2(l.unit_price), n2(l.line_total), l.eligible_persons, l.group_participant_count]), [[230, 218.5, 1, 2], [190, 171, 1, 1]]);
    assert.equal(n2((await ticket(c.ticket_id)).total_amount), 389.5); assert.equal((await ticket(c.ticket_id)).participant_count, 2);
  });

  await t('per-slot people inside one item: Anna+Ben 10-12, Anna alone 14-16 (same product) price like two items', async () => {
    const c = await book(base([known('a', ANNA), known('b', BEN)], [priv(PSKI, ['a', 'b'], [
      ap('2026-12-23', '10:00', '12:00', I[0]), ap('2026-12-23', '14:00', '16:00', I[0], { participants: ['a'] })])]));
    const ls = await lines(c.ticket_id);
    assert.deepEqual(ls.map((l) => n2(l.line_total)), [218.5, 171]); assert.equal(ls[0].period_group_id, ls[1].period_group_id);
    const pp = await sql`SELECT count(*)::int n FROM private_appointment_participants WHERE appointment_id = ${ls[1].appointment_id}`;
    assert.equal(pp[0].n, 1);
  });

  await t('manual override (explicit 0) replaces automatic for that item only; the other item stays automatic', async () => {
    const c = await book(base([known('a', ANNA)], [
      priv(PSKI, ['a'], [ap('2026-12-24', '10:00', '12:00', I[0])], { discount_override: { percent: 0, reason: 'Kein Rabatt' } }),
      priv(PSB, ['a'], [ap('2026-12-24', '14:00', '16:00', I[1])])]));
    const ls = await lines(c.ticket_id);
    assert.deepEqual(ls.map((l) => [n2(l.line_total), l.discount_source]), [[190, 'manual'], [171, 'automatic']]);
  });

  await t('existing booking of the same person counts (cross-booking) and is never repriced', async () => {
    const first = await book(base([known('c', CARL)], [priv(PSKI, ['c'], [ap('2026-12-28', '10:00', '12:00', I[2])])]));
    const snap = JSON.stringify(await lines(first.ticket_id));
    const c = await book(base([known('c', CARL)], [priv(PSB, ['c'], [ap('2026-12-28', '14:00', '16:00', I[3])])]));
    assert.equal(n2((await ticket(c.ticket_id)).total_amount), 171);
    assert.equal(JSON.stringify(await lines(first.ticket_id)), snap); assert.equal(n2((await ticket(first.ticket_id)).total_amount), 190);
  });

  await t('same-person overlap inside the cart is rejected (private/private and private/group); adjacent ok; nothing written', async () => {
    const before = await counts();
    const a = await multi(base([known('a', ANNA)], [priv(PSKI, ['a'], [ap('2026-12-29', '10:00', '12:00', I[0])]),
      priv(PSB, ['a'], [ap('2026-12-29', '11:00', '13:00', I[1])])]), 'quote');
    assert.equal(a.field, 'participant_overlap', JSON.stringify(a)); assert.equal(a.ref, 'a');
    const g = await multi(base([known('a', ANNA)], [{ kind: 'group', lines: [gline({ participant: 'a' })] },
      priv(PSKI, ['a'], [ap(WEEK[0], '11:00', '13:00', I[0])])]), 'quote');
    assert.equal(g.field, 'participant_overlap', JSON.stringify(g));
    assert.deepEqual(await counts(), before);
  });

  await t('group+private: one ticket, group tier + B09 season lunch + private 12-14, group hours do not count for the private discount', async () => {
    const before = await counts();
    const c = await book(base([known('a', ANNA)], [
      { kind: 'group', lines: [gline({ participant: 'a', lunch_dates: [WEEK[0], WEEK[1]], expected_unit_price: 320 })] },
      priv(PSKI, ['a'], [ap(WEEK[0], '12:00', '14:00', I[4])])]));
    const ls = await lines(c.ticket_id);
    assert.deepEqual(ls.map((l) => l.item_type).sort(), ['group', 'lunch', 'lunch', 'private']);
    assert.equal(n2(ls.find((l) => l.item_type === 'private').line_total), 150);
    assert.ok(ls.filter((l) => l.item_type === 'lunch').every((l) => l.product_id === LUNCH && n2(l.unit_price) === 30));
    const tk = await ticket(c.ticket_id); assert.equal(n2(tk.total_amount), 530); assert.equal(tk.participant_count, 1);
    const after = await counts(); assert.equal(after.tk - before.tk, 1); assert.equal(after.en - before.en, 10); assert.equal(after.cur - before.cur, 10);
    assert.equal((await sql`SELECT count(*)::int n FROM bc_2627_staff_group_submissions`)[0].n, 0); // no nested group booking
  });

  await t('group+group: one call, same tier prices as the single-item group path for the same lines', async () => {
    const twoLines = [gline({ participant: 'a', dates: WEEK.slice(0, 3) }), gline({ participant: 'b', course_id: C_SB, sport: 'snowboard', meeting_point: null, dates: WEEK.slice(0, 3) })];
    const c = await book(base([known('a', ANNA), known('b', BEN)], [{ kind: 'group', lines: [twoLines[0]] }, { kind: 'group', lines: [twoLines[1]] }],
      { group_discount: { percent: 5, reason: 'Familie' } }));
    const single = await sql.begin(async (tx) => {
      await tx`INSERT INTO customer_participants(id,customer_id,first_name,birth_date) VALUES (${id(0xe9)},${CUST2},'Eva','2016-01-01'),(${id(0xea)},${CUST2},'Finn','2016-01-01')`;
      const r1 = (await tx`SELECT bc_2627_staff_group_book(${sql.json({ submission_key: key(), customer_id: CUST2, discount_percent: 5, discount_reason: 'Familie',
        lines: [{ ...twoLines[0], participant: undefined, participant_id: id(0xe9) }, { ...twoLines[1], participant: undefined, participant_id: id(0xea) }] })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
      assert.equal(r1.ok, true, JSON.stringify(r1));
      const tot = n2((await tx`SELECT total_amount FROM tickets WHERE id = ${r1.ticket_id}`)[0].total_amount);
      await tx`SELECT 1/0`.catch(() => {}); throw Object.assign(new Error('rollback'), { tot });
    }).catch((e) => e.tot);
    assert.equal(n2((await ticket(c.ticket_id)).total_amount), single);
    assert.equal((await lines(c.ticket_id)).length, 2); assert.equal((await ticket(c.ticket_id)).participant_count, 2);
  });

  await t('shared draft guest: one person row across private + group items; level checked for private use', async () => {
    const before = await counts();
    const guest = { ref: 'g', guest: { first_name: 'Neu', last_name: 'Gast', birth_date: '2016-06-06', sport: 'ski', level: null } };
    const c = await book(base([guest], [priv(PSKI, ['g'], [ap(WEEK[2], '12:00', '14:00', I[5])]), { kind: 'group', lines: [gline({ participant: 'g' })] }]));
    assert.equal((await counts()).cp - before.cp, 1);
    assert.equal(c.participant_ids.g, (await lines(c.ticket_id)).find((l) => l.item_type === 'group').participant_id);
    const bad = await multi(base([{ ref: 'g', guest: { ...guest.guest, first_name: 'Anders', level: 'kein-level' } }], [priv(PSKI, ['g'], [ap(WEEK[3], '12:00', '14:00', I[5])])]), 'quote');
    assert.equal(bad.field, 'level');
    const dup = await multi(base([known('a', ANNA), known('a2', ANNA)], [priv(PSKI, ['a'], [ap(WEEK[3], '12:00', '14:00', I[5])])]), 'quote');
    assert.equal(dup.field, 'participants');
  });

  await t('final-position errors roll back tickets/people/enrollments/items/payment/intent/history', async () => {
    const guest = { ref: 'g', guest: { first_name: 'Rollback', birth_date: '2016-07-07', level: null } };
    const okPrivate = priv(PSKI, ['g'], [ap('2027-01-04', '10:00', '12:00', I[6])]);
    const cases = [
      // last item: group with an invalid meeting point
      [base([guest], [okPrivate, { kind: 'group', lines: [gline({ participant: 'g', meeting_point: 'nirgendwo', dates: ['2026-12-14'] })] }]), (r) => r.field === 'meeting_point' && r.item === 1],
      // finalization (paid now = payment row) with a missing hotel partner
      [base([guest], [okPrivate], { finalization: { payment_method: 'hotel', settlement: 'pay_later' } }), (r) => r.field === 'billing_partner_id'],
      // B08: future birth date of a draft guest
      [base([{ ref: 'g', guest: { first_name: 'Zukunft', birth_date: '2027-01-01', level: null } }], [okPrivate]), (r) => r.field === 'birth_date'],
      // B09: lunch on a half day
      [base([guest], [okPrivate, { kind: 'group', lines: [gline({ participant: 'g', dates: ['2026-12-15'], block: 'am', lunch_dates: ['2026-12-15'] })] }]), (r) => r.error === 'invalid'],
    ];
    for (const [p, check] of cases) {
      const before = await counts();
      const q = await multi(p, 'quote');
      const res = q.ok ? await multi({ ...p, acknowledged_quote_digest: q.quote.quote_digest, confirmation_requested: true }, 'create') : q;
      assert.ok(check(res), JSON.stringify(res));
      // paid-now path: payment insert happens inside and must roll back too
      assert.deepEqual(await counts(), before);
    }
    const paid = await multi(await ack(base([guest], [okPrivate], { finalization: { payment_method: 'cash', settlement: 'paid_now' }, confirmation_requested: true })), 'create');
    assert.equal(paid.ok, true, JSON.stringify(paid));
    const pay = await sql`SELECT amount FROM payments WHERE ticket_id = ${paid.ticket_id}`; assert.equal(pay.length, 1); assert.equal(n2(pay[0].amount), 190);
    assert.equal((await sql`SELECT requested FROM office_booking_confirmation_intents WHERE ticket_id = ${paid.ticket_id}`)[0].requested, true);
  });

  await t('stale quote: another booking for the same person/day or a tariff revision after the quote => quote_changed, nothing written', async () => {
    const p = await ack(base([known('b', BEN)], [priv(PSKI, ['b'], [ap('2027-01-05', '10:00', '12:00', I[7])])]));
    await book(base([known('b', BEN)], [priv(PSB, ['b'], [ap('2027-01-05', '14:00', '16:00', I[8])])]));
    const before = await counts();
    const r1 = await multi(p, 'create'); assert.equal(r1.error, 'quote_changed'); assert.equal(n2(r1.quote.total), 171);
    assert.deepEqual(await counts(), before);
    const [rev] = await sql`SELECT revision FROM product_private_tariff_revisions WHERE product_id = ${PSKI}`;
    await sql`SELECT save_product_private_tariff_rules(${PSKI}::uuid, ${rev.revision}, ${sql.json(MALBUN.map((x) => x.rule_kind === 'exact_block' && x.window_start === '10:00' ? { ...x, price_chf: 200 } : x))}::jsonb, ${ACTOR}::uuid)`;
    const r2 = await multi({ ...p, acknowledged_quote_digest: r1.quote.quote_digest }, 'create');
    assert.equal(r2.error, 'quote_changed'); assert.equal(n2(r2.quote.total), 180); assert.deepEqual(await counts(), before);
    const [rev2] = await sql`SELECT revision FROM product_private_tariff_revisions WHERE product_id = ${PSKI}`;
    await sql`SELECT save_product_private_tariff_rules(${PSKI}::uuid, ${rev2.revision}, ${sql.json(MALBUN)}::jsonb, ${ACTOR}::uuid)`;
  });

  await t('replay: concurrent identical creates and a lost-response retry give one ticket/intent; changed payload => submission_mismatch', async () => {
    const p = await ack(base([known('a', ANNA)], [priv(PSKI, ['a'], [ap('2027-01-06', '10:00', '12:00', I[0])])], { confirmation_requested: true }));
    const before = await counts();
    const [a, b] = await Promise.all([multi(p, 'create'), multi(p, 'create')]);
    assert.ok(a.ok && b.ok, JSON.stringify([a, b])); assert.equal(a.ticket_id, b.ticket_id); assert.ok(a.replayed || b.replayed);
    const after = await counts(); assert.equal(after.tk - before.tk, 1); assert.equal(after.oi - before.oi, 1); assert.equal(after.sub - before.sub, 1);
    const again = await multi(p, 'create'); assert.equal(again.replayed, true); assert.equal(again.ticket_id, a.ticket_id); assert.equal(again.confirmation_requested, true);
    assert.deepEqual(await counts(), after);
    const changed = await multi({ ...p, notes: 'anders' }, 'create'); assert.equal(changed.error, 'submission_mismatch');
    assert.deepEqual(await counts(), after);
  });

  await t('concurrency: multi create holds the participant/day lock; a parallel single create waits and then needs a new quote', async () => {
    const day = '2027-01-07';
    const single = { product_id: PSKI, persons: 1, customer_id: CUST, participant_ids: [CARL], appointments: [{ date: day, time_start: '14:00', time_end: '16:00' }] };
    const sq = (await sql`SELECT pa_create_quote(${sql.json(single)}::jsonb) r`)[0].r; assert.equal(sq.ok, true, JSON.stringify(sq));
    const mp = await ack(base([known('c', CARL)], [priv(PSB, ['c'], [ap(day, '10:00', '12:00', I[1])])]));
    let second;
    const out = await sql.begin(async (tx) => {
      const m = await multi(mp, 'create', tx);
      second = sql`SELECT pa_create_booking_finalized(${sql.json({ submission_key: key(), customer_id: CUST, product_id: PSKI,
        appointments: [{ date: day, time_start: '14:00', time_end: '16:00', instructor_id: I[2] }], participants: [{ participant_id: CARL }],
        quote_revision: sq.revision, discount_rule_revision: sq.discount_rule_revision, day_context_digest: sq.day_context_digest })}::jsonb, ${ACTOR}::uuid) r`.then((x) => x[0].r);
      const raced = await Promise.race([second.then(() => 'done'), new Promise((ok) => setTimeout(() => ok('blocked'), 400))]);
      return { m, raced };
    });
    assert.equal(out.m.ok, true, JSON.stringify(out.m)); assert.equal(out.raced, 'blocked');
    assert.equal((await second).error, 'quote_changed');
  });

  await t('concurrency: two carts for the same teacher slot => exactly one booking, the other a conflict', async () => {
    const mk = (cust, pid) => ack({ ...base([known('x', pid)], [priv(PSKI, ['x'], [ap('2027-01-08', '10:00', '12:00', I[9])])]), customer_id: cust });
    const [p1, p2] = await Promise.all([mk(CUST, ANNA), mk(CUST2, DORA)]);
    const res = await Promise.all([multi(p1, 'create'), multi(p2, 'create')]);
    assert.equal(res.filter((x) => x.ok).length, 1, JSON.stringify(res)); assert.equal(res.find((x) => !x.ok).error, 'conflict');
  });

  await t('single-item contracts preserved: group single path still creates its own ticket; marker never leaks', async () => {
    const r1 = (await sql`SELECT bc_2627_staff_group_book(${sql.json({ submission_key: key(), customer_id: CUST, lines: [{ ...gline({ dates: ['2026-12-16'] }), participant_id: CARL }] })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.equal((await sql`SELECT count(*)::int n FROM bc_2627_staff_group_submissions WHERE ticket_id = ${r1.ticket_id}`)[0].n, 1);
    const mixed = await sql.begin(async (tx) => {
      await multi(await ack(base([known('b', BEN)], [{ kind: 'group', lines: [gline({ participant: 'b', dates: ['2026-12-17'] })] }]), tx), 'create', tx);
      return (await tx`SELECT bc_2627_staff_group_book(${sql.json({ submission_key: key(), customer_id: CUST2, lines: [{ ...gline({ dates: ['2026-12-17'] }), participant_id: DORA }] })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    });
    assert.equal(mixed.ok, true, JSON.stringify(mixed));
    assert.equal((await ticket(mixed.ticket_id)).customer_id, CUST2);
  });

  await t('L1 fix: raw UPDATE re-pointing a participant of a tariff-priced lesson is refused (YT001); attendance stays editable', async () => {
    const c = await book(base([known('a', ANNA)], [priv(PSKI, ['a'], [ap('2027-01-11', '10:00', '12:00', I[0])])]));
    const aid = c.appointment_ids[0];
    await assert.rejects(sql`UPDATE private_appointment_participants SET participant_id = ${BEN} WHERE appointment_id = ${aid}`, (e) => e.code === 'YT001');
    await sql`UPDATE private_appointment_participants SET attendance = 'present' WHERE appointment_id = ${aid}`;
  });

  await t('L1 fix: period_update whose locks were taken for a stale date returns stale (no write), fresh call succeeds', async () => {
    const c = await book(base([known('b', BEN)], [priv(PSKI, ['b'], [ap('2027-01-12', '10:00', '12:00', I[3]), ap('2027-01-13', '10:00', '12:00', I[3])])]));
    const [a1] = c.appointment_ids;
    const [{ period_group_id: grp }] = await sql`SELECT period_group_id FROM private_appointments WHERE id = ${a1}`;
    let pu;
    await sql.begin(async (tx) => {
      const m = (await tx`SELECT pa_move_appointment(${a1}::uuid, '2027-01-14'::date, '10:00'::time, '12:00'::time, ${I[3]}::uuid, ${ACTOR}::uuid, NULL::jsonb) r`)[0].r;
      assert.equal(m.ok, true, JSON.stringify(m));
      pu = sql`SELECT pa_period_update(${grp}::uuid, ${sql.json({ instructor_id: I[4] })}::jsonb, ${ACTOR}::uuid, NULL::jsonb) r`.then((x) => x[0].r);
      await new Promise((ok) => setTimeout(ok, 300));
    });
    const res = await pu; assert.equal(res.error, 'conflict', JSON.stringify(res)); assert.equal(res.conflicts[0].kind, 'stale');
    const again = (await sql`SELECT pa_period_update(${grp}::uuid, ${sql.json({ instructor_id: I[4] })}::jsonb, ${ACTOR}::uuid, NULL::jsonb) r`)[0].r;
    assert.equal(again.ok, true, JSON.stringify(again));
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length - 1} passed`);
  if (passed !== results.length - 1) process.exitCode = 1;
}
