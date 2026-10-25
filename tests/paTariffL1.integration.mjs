// B07 L1 real SQL tests: move / period_update / B03a edit of product-tariff-priced private lessons,
// participant/day locking against concurrent creates, quote staleness and unchanged history.
// Throwaway local PostgreSQL only (production schema baseline + pending SQL + synthetic data).
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/paTariffL1.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `pa_l1_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 8 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), P = id(0xa0), ACTOR = id(0xbeef), CUST = id(0xc1);
const ANNA = id(0xe1), BEN = id(0xe2), CARL = id(0xe3);
const I = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => id(0xf000 + n));
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
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/pa_assign_later.sql',
    'supabase/pending/course_archive_delete.sql', 'supabase/pending/bc_2627_staff_group_booking.sql',
    'supabase/pending/bc_2627_staff_group_booking_v2.sql', 'supabase/pending/staff_booking_finalize.sql',
    'supabase/pending/staff_guest_level.sql', 'supabase/pending/pa_edit_booking.sql',
    'supabase/pending/product_private_tariff_rules.sql', 'supabase/pending/pa_tariff_l1.sql']) {
    const res = psqlFile(f); if (res.status !== 0) throw new Error(`psql ${f}: ${res.stderr}`);
  }
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-25' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO user_roles(user_id, role) VALUES ('${ACTOR}','office');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES ('${P}','Privat Ski','private',120,0,'${S}',true);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ${I.map((x, n) => `('${x}','L${n}','Synth','active','{ski}')`).join(',')};
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES
      ('${ANNA}','${CUST}','Anna','Synth','2010-02-02'),('${BEN}','${CUST}','Ben','Synth','2012-03-03'),('${CARL}','${CUST}','Carl','Synth','2011-04-04');
    INSERT INTO private_lesson_discount_rule(percent,threshold_minutes,provenance) VALUES (10,240,'fixture = PROPOSED seed');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('09:00','17:00',80);
  `).catch(async (e) => { throw new Error('fixture: ' + e.message); });
  await sql`SELECT save_product_private_tariff_rules(${P}::uuid, 0, ${sql.json(MALBUN)}::jsonb, ${ACTOR}::uuid)`;

  const slot = (date, s, e, ins) => ({ date, time_start: s, time_end: e, instructor_id: ins });
  const quote = async (appts, parts, extra = {}) => (await sql`SELECT pa_create_quote(${sql.json({
    product_id: P, persons: parts.length, customer_id: CUST, participant_ids: parts,
    appointments: appts.map(({ date, time_start, time_end }) => ({ date, time_start, time_end })), ...extra })}::jsonb) r`)[0].r;
  let k = 0; const key = () => `l1-${++k}-${Date.now()}`;
  const createFrom = async (q, appts, parts, more = {}, db = sql) => (await db`SELECT pa_create_booking_finalized(${sql.json({
    submission_key: key(), customer_id: CUST, product_id: P, appointments: appts, participants: parts.map((x) => ({ participant_id: x })),
    quote_revision: q.revision, discount_rule_revision: q.discount_rule_revision, day_context_digest: q.day_context_digest, ...more })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
  const book = async (appts, parts, more = {}) => {
    const q = await quote(appts, parts, more.discount_override ? { discount_override: { percent: more.discount_override.percent } } : {});
    assert.equal(q.ok, true, JSON.stringify(q));
    const c = await createFrom(q, appts, parts, more); assert.equal(c.ok, true, JSON.stringify(c)); return c;
  };
  const move = async (a, date, s, e, ins, ack = null, db = sql) =>
    (await db`SELECT pa_move_appointment(${a}::uuid, ${date}::date, ${s}::time, ${e}::time, ${ins}::uuid, ${ACTOR}::uuid, ${ack ? sql.json({ quote_digest: ack }) : null}::jsonb) r`)[0].r;
  const legacyMove = async (a, date, s, e, ins) =>
    (await sql`SELECT pa_move_appointment(${a}::uuid, ${date}::date, ${s}::time, ${e}::time, ${ins}::uuid, ${ACTOR}::uuid) r`)[0].r;
  const total = async (tk) => n2((await sql`SELECT total_amount FROM tickets WHERE id = ${tk}`)[0].total_amount);
  const line = async (a) => (await sql`SELECT unit_price, discount_percent, line_total FROM ticket_items WHERE appointment_id = ${a}`)[0];
  const pricing = async (a) => (await sql`SELECT * FROM private_appointment_pricing WHERE appointment_id = ${a}`)[0];
  const snap = async (ticket) => (await sql`SELECT jsonb_build_object(
      't', (SELECT to_jsonb(x) FROM tickets x WHERE id = ${ticket}),
      'i', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM ticket_items x WHERE ticket_id = ${ticket}),
      'a', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM private_appointments x WHERE ticket_id = ${ticket}),
      'pp', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM private_appointment_participants x WHERE appointment_id IN (SELECT id FROM private_appointments WHERE ticket_id = ${ticket})),
      'pr', (SELECT jsonb_agg(to_jsonb(x) ORDER BY appointment_id) FROM private_appointment_pricing x WHERE appointment_id IN (SELECT id FROM private_appointments WHERE ticket_id = ${ticket})),
      'h', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM ticket_history x WHERE ticket_id = ${ticket}),
      'pay', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM payments x WHERE ticket_id = ${ticket}),
      'inv', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM invoices x WHERE ticket_id = ${ticket}))::text s`)[0].s;
  // B03a edit request built from the stored state exactly like the Office editor does.
  const editReq = async (ticket, edits) => {
    const appts = [];
    for (const [aid, change] of Object.entries(edits)) {
      const [x] = await sql`SELECT pa.price, jsonb_build_object('date',pa.date,'time_start',pa.time_start::text,'time_end',pa.time_end::text,
          'instructor_id',pa.instructor_id,'meeting_point',pa.meeting_point,'status',pa.status,
          'line',jsonb_build_object('id',ti.id,'quantity',ti.quantity,'unit_price',ti.unit_price,'line_total',ti.line_total,
            'discount_percent',ti.discount_percent,'discount_reason',ti.discount_reason,'internal_notes',ti.internal_notes,'instructor_notes',ti.instructor_notes)) e,
          (SELECT coalesce(jsonb_agg(participant_id ORDER BY participant_id), '[]') FROM private_appointment_participants WHERE appointment_id = pa.id) parts
        FROM private_appointments pa JOIN ticket_items ti ON ti.appointment_id = pa.id WHERE pa.id = ${aid}`;
      appts.push({ appointment_id: aid, expected_participant_ids: x.parts, expected_price: Number(x.price), expected: x.e, ...change });
    }
    return { ticket_id: ticket, expected_total: await total(ticket), appointments: appts };
  };
  const edit = async (req, db = sql) => (await db`SELECT pa_edit_booking(${sql.json(req)}::jsonb, ${ACTOR}::uuid) r`)[0].r;

  await t('grants: L1 helpers and new overloads are service-only', async () => {
    for (const f of ['pa_lock_days(uuid[],date[])', 'pa_l1_requote(jsonb)', 'pa_l1_write_pricing(jsonb)', 'pa_l1_line_net(uuid)',
      'pa_move_appointment(uuid,date,time,time,uuid,uuid,jsonb)', 'pa_period_update(uuid,jsonb,uuid,jsonb)', 'pa_private_day_context(uuid[],date[],uuid[])']) {
      for (const role of ['anon', 'authenticated']) assert.equal((await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`)[0].ok, false, `${role} ${f}`);
      assert.equal((await sql`SELECT has_function_privilege('service_role', ${'public.' + f}, 'EXECUTE') ok`)[0].ok, true, f);
    }
  });

  await t('teacher-only move keeps price, discount, total and pricing row (no ack)', async () => {
    const c = await book([slot('2026-12-07', '10:00', '12:00', I[0])], [ANNA]);
    const a = c.appointment_ids[0]; const before = await pricing(a);
    const m = await move(a, '2026-12-07', '10:00', '12:00', I[1]);
    assert.equal(m.ok, true, JSON.stringify(m));
    assert.equal(await total(c.ticket_id), 190); assert.equal(n2((await line(a)).unit_price), 190);
    const after = await pricing(a); assert.equal(after.updated_at.getTime(), before.updated_at.getTime());
  });

  await t('time move 10–12 → 12–14: quote_changed without ack (nothing written), with ack 150 + history', async () => {
    const c = await book([slot('2026-12-08', '10:00', '12:00', I[0])], [ANNA]);
    const a = c.appointment_ids[0]; const before = await snap(c.ticket_id);
    const q = await move(a, '2026-12-08', '12:00', '14:00', I[0]);
    assert.equal(q.error, 'quote_changed'); assert.equal(n2(q.quote.items[0].gross), 150); assert.equal(n2(q.quote.new_total), 150);
    assert.equal(await snap(c.ticket_id), before);
    const bad = await move(a, '2026-12-08', '12:00', '14:00', I[0], 'f'.repeat(32)); assert.equal(bad.error, 'quote_changed');
    assert.equal(await snap(c.ticket_id), before);
    const m = await move(a, '2026-12-08', '12:00', '14:00', I[0], q.quote.quote_digest);
    assert.equal(m.ok, true, JSON.stringify(m));
    assert.equal(await total(c.ticket_id), 150); assert.equal(n2((await line(a)).line_total), 150);
    const pr = await pricing(a); assert.equal(String(pr.priced_time_start), '12:00:00'); assert.equal(n2(pr.gross_price), 150);
    const [h] = await sql`SELECT details FROM ticket_history WHERE ticket_id = ${c.ticket_id} AND details->>'change' = 'moved'`;
    assert.equal(n2(h.details.pricing.from.gross), 190); assert.equal(n2(h.details.pricing.to.gross), 150);
    assert.equal(h.details.pricing.acknowledged, true); assert.equal(n2(h.details.old_total), 190); assert.equal(n2(h.details.new_total), 150);
  });

  await t('same-price date move needs no ack and leaves total unchanged', async () => {
    const c = await book([slot('2026-12-09', '10:00', '12:00', I[2])], [CARL]);
    const m = await move(c.appointment_ids[0], '2026-12-10', '10:00', '12:00', I[2]);
    assert.equal(m.ok, true, JSON.stringify(m)); assert.equal(await total(c.ticket_id), 190);
    assert.equal(String((await pricing(c.appointment_ids[0])).priced_date.toISOString().slice(0, 10)), '2026-12-10');
  });

  let ctxTicket;
  await t('move onto a day with another booking: 4h union => 10% on the moved line only; other booking byte-identical', async () => {
    const other = await book([slot('2026-12-14', '14:00', '16:00', I[0])], [ANNA]); ctxTicket = other.ticket_id;
    const otherBefore = await snap(other.ticket_id);
    const c = await book([slot('2026-12-11', '10:00', '12:00', I[1])], [ANNA]);
    const q = await move(c.appointment_ids[0], '2026-12-14', '10:00', '12:00', I[1]);
    assert.equal(q.error, 'quote_changed'); assert.equal(n2(q.quote.items[0].net), 171); assert.equal(q.quote.items[0].eligible, 1);
    const m = await move(c.appointment_ids[0], '2026-12-14', '10:00', '12:00', I[1], q.quote.quote_digest);
    assert.equal(m.ok, true); assert.equal(await total(c.ticket_id), 171);
    assert.equal(await snap(other.ticket_id), otherBefore);
    const pr = await pricing(c.appointment_ids[0]); assert.equal(pr.discount_source, 'automatic'); assert.equal(pr.eligible_persons, 1);
  });

  await t('moving away from the 4h day: own discount drops (190), the other booking is NOT repriced', async () => {
    const [x] = await sql`SELECT pa.id FROM private_appointments pa WHERE pa.date = '2026-12-14' AND pa.time_start = '10:00' AND pa.ticket_id <> ${ctxTicket}`;
    const before = await snap(ctxTicket);
    const q = await move(x.id, '2026-12-15', '10:00', '12:00', I[1]);
    assert.equal(q.error, 'quote_changed'); assert.equal(n2(q.quote.items[0].net), 190);
    assert.equal((await move(x.id, '2026-12-15', '10:00', '12:00', I[1], q.quote.quote_digest)).ok, true);
    assert.equal(await snap(ctxTicket), before);
  });

  await t('stale ack: context changes after the quote (new booking / tariff revision) => quote_changed, nothing written', async () => {
    const c = await book([slot('2026-12-16', '10:00', '12:00', I[3])], [BEN]);
    const q = await move(c.appointment_ids[0], '2026-12-17', '10:00', '12:00', I[3]);
    assert.equal(q.ok, true); // same price, no context: done
    const q2 = await move(c.appointment_ids[0], '2026-12-17', '12:00', '14:00', I[3]);
    assert.equal(q2.error, 'quote_changed');
    await book([slot('2026-12-17', '14:00', '16:00', I[4])], [BEN]); // another booking: Ben now 4h on 17.12.
    const before = await snap(c.ticket_id);
    const r1 = await move(c.appointment_ids[0], '2026-12-17', '12:00', '14:00', I[3], q2.quote.quote_digest);
    assert.equal(r1.error, 'quote_changed'); assert.equal(n2(r1.quote.items[0].net), 135); assert.equal(await snap(c.ticket_id), before);
    const [rev] = await sql`SELECT revision FROM product_private_tariff_revisions WHERE product_id = ${P}`;
    await sql`SELECT save_product_private_tariff_rules(${P}::uuid, ${rev.revision}, ${sql.json(MALBUN.map((x) => x.window_start === '12:00' && x.rule_kind === 'exact_block' ? { ...x, price_chf: 160 } : x))}::jsonb, ${ACTOR}::uuid)`;
    const r2 = await move(c.appointment_ids[0], '2026-12-17', '12:00', '14:00', I[3], r1.quote.quote_digest);
    assert.equal(r2.error, 'quote_changed'); assert.equal(n2(r2.quote.items[0].gross), 160); assert.equal(await snap(c.ticket_id), before);
    const [rev2] = await sql`SELECT revision FROM product_private_tariff_revisions WHERE product_id = ${P}`;
    await sql`SELECT save_product_private_tariff_rules(${P}::uuid, ${rev2.revision}, ${sql.json(MALBUN)}::jsonb, ${ACTOR}::uuid)`;
  });

  await t('stored manual override (explicit 0) is re-applied and replaces the automatic discount on move', async () => {
    await book([slot('2026-12-18', '14:00', '16:00', I[0])], [CARL]);
    const c = await book([slot('2026-12-19', '10:00', '12:00', I[1])], [CARL], { discount_override: { percent: 0, reason: 'Kulanz: kein Rabatt' } });
    const m = await move(c.appointment_ids[0], '2026-12-18', '10:00', '12:00', I[1]);
    assert.equal(m.ok, true, JSON.stringify(m)); // 4h day, but manual 0 replaces automatic => same price, no ack
    const pr = await pricing(c.appointment_ids[0]); assert.equal(pr.discount_source, 'manual'); assert.equal(n2(pr.discount_percent), 0);
    assert.equal(pr.discount_reason, 'Kulanz: kein Rabatt'); assert.equal(await total(c.ticket_id), 190);
  });

  await t('period_update 10–12 → 12–14 on a 2-day series: one ack for both, 150 each, net delta total', async () => {
    const c = await book([slot('2026-12-21', '10:00', '12:00', I[5]), slot('2026-12-22', '10:00', '12:00', I[5])], [CARL]);
    const [g] = await sql`SELECT period_group_id FROM private_appointments WHERE ticket_id = ${c.ticket_id} LIMIT 1`;
    const pu = async (ack) => (await sql`SELECT pa_period_update(${g.period_group_id}::uuid, ${sql.json({ time_start: '12:00', time_end: '14:00' })}::jsonb, ${ACTOR}::uuid, ${ack ? sql.json({ quote_digest: ack }) : null}::jsonb) r`)[0].r;
    const before = await snap(c.ticket_id);
    const q = await pu(null); assert.equal(q.error, 'quote_changed'); assert.equal(q.quote.items.length, 2); assert.equal(n2(q.quote.new_total), 300);
    assert.equal(await snap(c.ticket_id), before);
    const ok = await pu(q.quote.quote_digest); assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(await total(c.ticket_id), 300);
    const legacy = (await sql`SELECT pa_period_update(${g.period_group_id}::uuid, ${sql.json({ instructor_id: I[4] })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(legacy.ok, true, JSON.stringify(legacy)); assert.equal(await total(c.ticket_id), 300); // teacher-only via 3-arg: unchanged
  });

  await t('edit: add Ben to a tariff lesson => requote 230 with digest; apply without digest refused; with digest ok', async () => {
    const c = await book([slot('2026-12-23', '10:00', '12:00', I[6])], [ANNA]);
    const a = c.appointment_ids[0];
    const req = await editReq(c.ticket_id, { [a]: { participant_ids: [ANNA, BEN] } });
    const q = await edit({ ...req, mode: 'quote' });
    assert.equal(q.ok, true, JSON.stringify(q)); assert.equal(n2(q.quote.appointments[0].new_price), 230); assert.match(q.quote.quote_digest, /^[0-9a-f]{32}$/);
    const before = await snap(c.ticket_id);
    req.appointments[0].acknowledged_price = 230;
    const noDigest = await edit({ ...req, mode: 'apply', acknowledged_total: 230 });
    assert.equal(noDigest.error, 'quote_changed'); assert.equal(await snap(c.ticket_id), before);
    const ok = await edit({ ...req, mode: 'apply', acknowledged_total: 230, acknowledged_quote_digest: q.quote.quote_digest });
    assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(await total(c.ticket_id), 230);
    const pr = await pricing(a); assert.deepEqual([...pr.participant_ids].sort(), [ANNA, BEN].sort()); assert.equal(pr.persons, 2);
  });

  await t('edit: note-only and unchanged save on a tariff lesson keep price/total, no ack', async () => {
    const c = await book([slot('2026-12-24', '10:00', '12:00', I[7])], [CARL]);
    const a = c.appointment_ids[0];
    const noop = await edit({ ...(await editReq(c.ticket_id, { [a]: {} })), mode: 'apply' });
    assert.equal(noop.changed, false);
    const note = await edit({ ...(await editReq(c.ticket_id, { [a]: { internal_notes: 'Treffpunkt Kasse' } })), mode: 'apply' });
    assert.equal(note.ok, true, JSON.stringify(note)); assert.equal(await total(c.ticket_id), 190);
    assert.equal(n2((await line(a)).unit_price), 190);
  });

  await t('raw table writes still cannot reprice tariff lessons (YT001)', async () => {
    const c = await book([slot('2026-12-28', '10:00', '12:00', I[0])], [CARL]);
    const a = c.appointment_ids[0];
    await assert.rejects(sql`UPDATE ticket_items SET unit_price = 1 WHERE appointment_id = ${a}`, /tariff_transition_required/);
    await assert.rejects(sql`UPDATE private_appointments SET time_end = '13:00' WHERE id = ${a}`, /tariff_transition_required/);
    await assert.rejects(sql`INSERT INTO private_appointment_participants(appointment_id, participant_id) VALUES (${a}, ${BEN})`, /tariff_transition_required/);
    await assert.rejects(sql`DELETE FROM private_appointment_participants WHERE appointment_id = ${a}`, /tariff_transition_required/);
  });

  await t('invoiced ticket: move refused as protected, nothing written', async () => {
    const c = await book([slot('2026-12-29', '10:00', '12:00', I[1])], [CARL]);
    await sql`INSERT INTO invoices(ticket_id, invoice_number, status, issued_at, subtotal, total, qr_reference, due_date) VALUES (${c.ticket_id}, ${'R-' + Date.now()}, 'sent', now(), 190, 190, 'QR-SYNTH', '2027-01-31')`;
    const before = await snap(c.ticket_id);
    const m = await move(c.appointment_ids[0], '2026-12-29', '12:00', '14:00', I[1]);
    assert.equal(m.error, 'protected'); assert.equal(await snap(c.ticket_id), before);
  });

  await t('legacy appointment (no pricing row): move unchanged (pa_price + full recalc), 6-arg signature', async () => {
    const c = await book([slot('2026-12-30', '10:00', '12:00', I[2])], [CARL]);
    const a = c.appointment_ids[0];
    await sql`DELETE FROM private_appointment_pricing WHERE appointment_id = ${a}`;
    const m = await legacyMove(a, '2026-12-30', '12:00', '15:00', I[2]);
    assert.equal(m.ok, true, JSON.stringify(m)); assert.equal(n2(m.price), 240); assert.equal(await total(c.ticket_id), 240);
  });

  await t('concurrency: create for Anna waits for an in-flight move onto her day, then quote_changed', async () => {
    const day = '2027-01-05';
    const c = await book([slot('2027-01-04', '10:00', '12:00', I[3])], [ANNA]);
    const qm = await move(c.appointment_ids[0], day, '14:00', '16:00', I[3]); assert.equal(qm.ok, true); // same price
    const c2 = await book([slot('2027-01-06', '10:00', '12:00', I[4])], [ANNA]);
    const a2 = [slot(day, '10:00', '12:00', I[5])];
    const qNew = await quote(a2, [ANNA]); assert.equal(qNew.existing_appointments, 1);
    // move c2's lesson from 06.01. to 05.01. 12–14 (would make Anna 6h); concurrent create quoted before must fail.
    const qmv = await move(c2.appointment_ids[0], day, '12:00', '14:00', I[4]); assert.equal(qmv.error, 'quote_changed');
    let second;
    const out = await sql.begin(async (tx) => {
      const m = await move(c2.appointment_ids[0], day, '12:00', '14:00', I[4], qmv.quote.quote_digest, tx);
      second = createFrom(qNew, a2, [ANNA]);
      const raced = await Promise.race([second.then(() => 'done'), new Promise((ok) => setTimeout(() => ok('blocked'), 400))]);
      return { m, raced };
    });
    assert.equal(out.m.ok, true, JSON.stringify(out.m)); assert.equal(out.raced, 'blocked');
    const res = await second; assert.equal(res.error, 'quote_changed');
  });

  await t('concurrency: edit adding Anna waits for an in-flight create on her day; apply then refused as stale quote', async () => {
    const day = '2027-01-08';
    const c = await book([slot(day, '14:00', '16:00', I[6])], [BEN]);
    const req = await editReq(c.ticket_id, { [c.appointment_ids[0]]: { participant_ids: [ANNA, BEN] } });
    const q = await edit({ ...req, mode: 'quote' });
    req.appointments[0].acknowledged_price = Number(q.quote.appointments[0].new_price);
    const applyReq = { ...req, mode: 'apply', acknowledged_total: Number(q.quote.new_total), acknowledged_quote_digest: q.quote.quote_digest };
    const a1 = [slot(day, '10:00', '12:00', I[7])]; const qa = await quote(a1, [ANNA]);
    let second;
    const out = await sql.begin(async (tx) => {
      const cr = await createFrom(qa, a1, [ANNA], {}, tx);
      second = edit(applyReq);
      const raced = await Promise.race([second.then(() => 'done'), new Promise((ok) => setTimeout(() => ok('blocked'), 400))]);
      return { cr, raced };
    });
    assert.equal(out.cr.ok, true, JSON.stringify(out.cr)); assert.equal(out.raced, 'blocked');
    const res = await second; assert.equal(res.error, 'quote_changed', JSON.stringify(res)); // Anna now has 4h: discount differs
    const fresh = await edit({ ...req, mode: 'quote' }); assert.ok(n2(fresh.quote.new_total) < n2(q.quote.new_total));
  });

  await t('no deadlock: concurrent move of lesson A and edit of lesson B in the same ticket both finish', async () => {
    const c = await book([slot('2027-01-11', '10:00', '12:00', I[0]), slot('2027-01-12', '10:00', '12:00', I[0])], [CARL]);
    const [aA, aB] = c.appointment_ids;
    const req = await editReq(c.ticket_id, { [aB]: { internal_notes: 'parallel' } });
    const [m, e] = await Promise.all([move(aA, '2027-01-11', '10:00', '12:00', I[1]), edit({ ...req, mode: 'apply' })]);
    assert.equal(m.ok, true, JSON.stringify(m));
    assert.ok(e.ok === true || (e.error === 'conflict'), JSON.stringify(e)); // stale total is fine; never a deadlock error
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}
