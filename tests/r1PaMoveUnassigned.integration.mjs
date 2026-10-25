// R1 (S2) real SQL tests for keeping "Später zuweisen" on position edits (migration 0030), on top of L1.
// Derived from paTariffL1.integration.mjs.
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
const dbName = `r1_move_${Date.now()}`;
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
    'supabase/pending/staff_guest_level.sql', 'drizzle/migrations/0022_pa_edit_booking.sql',
    'drizzle/migrations/0024_product_private_tariff_rules.sql', 'drizzle/migrations/0025_pa_tariff_l1.sql', 'drizzle/migrations/0030_r1_pa_move_keep_unassigned.sql']) {
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


  const later = (date, s, e) => ({ date, time_start: s, time_end: e, assign_later: true });
  const moveOpt = async (a, date, s, e, ins, ack) =>
    (await sql`SELECT pa_move_appointment(${a}::uuid, ${date}::date, ${s}::time, ${e}::time, ${ins}::uuid, ${ACTOR}::uuid, ${ack ? sql.json(ack) : null}::jsonb) r`)[0].r;
  const appt = async (a) => (await sql`SELECT instructor_id, date::text d, time_start::text s, time_end::text e FROM private_appointments WHERE id = ${a}`)[0];

  await t('null->null notes-only: no move needed; raw note update keeps price and teacher NULL', async () => {
    const c = await book([later('2026-12-14', '10:00', '12:00')], [ANNA]);
    const a = c.appointment_ids[0];
    await sql`UPDATE ticket_items SET internal_notes = 'nur Notiz' WHERE appointment_id = ${a}`;
    assert.equal((await appt(a)).instructor_id, null); assert.equal(await total(c.ticket_id), 190);
    assert.equal(n2((await line(a)).unit_price), 190);
  });
  await t('null->null time move without intent is invalid, nothing written', async () => {
    const c = await book([later('2026-12-15', '10:00', '12:00')], [ANNA]);
    const before = await snap(c.ticket_id);
    const m = await moveOpt(c.appointment_ids[0], '2026-12-15', '14:00', '16:00', null, null);
    assert.equal(m.error, 'invalid'); assert.equal(await snap(c.ticket_id), before);
  });
  await t('null->null time move with assign_later: same price window keeps 190, teacher stays NULL', async () => {
    const c = await book([later('2026-12-16', '10:00', '12:00')], [ANNA]);
    const a = c.appointment_ids[0];
    const m = await moveOpt(a, '2026-12-16', '14:00', '16:00', null, { assign_later: true });
    assert.equal(m.ok, true, JSON.stringify(m));
    const x = await appt(a); assert.equal(x.instructor_id, null); assert.equal(x.s, '14:00:00');
    assert.equal(await total(c.ticket_id), 190);
  });
  await t('null->null price-changing move still needs ack (quote_changed, then ok with digest + intent)', async () => {
    const c = await book([later('2026-12-17', '10:00', '12:00')], [ANNA]);
    const a = c.appointment_ids[0]; const before = await snap(c.ticket_id);
    const q = await moveOpt(a, '2026-12-17', '12:00', '14:00', null, { assign_later: true });
    assert.equal(q.error, 'quote_changed'); assert.equal(await snap(c.ticket_id), before);
    const m = await moveOpt(a, '2026-12-17', '12:00', '14:00', null, { assign_later: true, quote_digest: q.quote.quote_digest });
    assert.equal(m.ok, true, JSON.stringify(m)); assert.equal(await total(c.ticket_id), 150); assert.equal((await appt(a)).instructor_id, null);
  });
  await t('assigned -> NULL refused even with assign_later intent', async () => {
    const c = await book([slot('2026-12-18', '10:00', '12:00', I[2])], [ANNA]);
    const before = await snap(c.ticket_id);
    const m = await moveOpt(c.appointment_ids[0], '2026-12-18', '10:00', '12:00', null, { assign_later: true });
    assert.equal(m.error, 'invalid'); assert.equal(await snap(c.ticket_id), before);
  });
  await t('explicit assignment NULL -> teacher keeps price, records teacher', async () => {
    const c = await book([later('2026-12-21', '10:00', '12:00')], [ANNA]);
    const a = c.appointment_ids[0];
    const m = await moveOpt(a, '2026-12-21', '10:00', '12:00', I[3], null);
    assert.equal(m.ok, true, JSON.stringify(m)); assert.equal((await appt(a)).instructor_id, I[3]); assert.equal(await total(c.ticket_id), 190);
  });
  await t('stale editor: lesson assigned meanwhile -> NULL intent refused', async () => {
    const c = await book([later('2026-12-22', '10:00', '12:00')], [ANNA]);
    const a = c.appointment_ids[0];
    assert.equal((await moveOpt(a, '2026-12-22', '10:00', '12:00', I[4], null)).ok, true);
    const before = await snap(c.ticket_id);
    const m = await moveOpt(a, '2026-12-22', '14:00', '16:00', null, { assign_later: true });
    assert.equal(m.error, 'invalid'); assert.equal(await snap(c.ticket_id), before);
  });
  await t('protected (invoiced) unassigned lesson: intent move refused, nothing written', async () => {
    const c = await book([later('2026-12-23', '10:00', '12:00')], [ANNA]);
    await sql`INSERT INTO invoices(ticket_id, invoice_number, status, issued_at, subtotal, total, qr_reference, due_date) VALUES (${c.ticket_id}, ${'R-R1-' + Date.now()}, 'sent', now(), 190, 190, 'QR-SYNTH', '2027-01-31')`;
    const before = await snap(c.ticket_id);
    const m = await moveOpt(c.appointment_ids[0], '2026-12-23', '14:00', '16:00', null, { assign_later: true });
    assert.equal(m.error, 'protected'); assert.equal(await snap(c.ticket_id), before);
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}
