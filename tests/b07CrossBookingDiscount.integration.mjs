// B07-P3 real SQL tests: cross-booking same-participant/same-day discount eligibility.
// Already booked PRIVATE lessons of the same stable participant id on the same date count toward the
// configured threshold; only the NEW lesson shares are discounted; earlier bookings are never repriced.
// Throwaway local PostgreSQL only; all amounts are fixture DATA (same rows as the PROPOSED seed).
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/b07CrossBookingDiscount.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `b07_cross_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 6 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), P = id(0xa0), ACTOR = id(0xbeef), CUST = id(0xc1), CUST2 = id(0xc2);
const ANNA = id(0xe1), BEN = id(0xe2), CARL = id(0xe3), FOREIGN = id(0xe9);
const I = [1, 2, 3, 4, 5, 6].map((n) => id(0xf000 + n));
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
];

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/pa_assign_later.sql',
    'supabase/pending/course_archive_delete.sql', 'supabase/pending/bc_2627_staff_group_booking.sql',
    'supabase/pending/bc_2627_staff_group_booking_v2.sql', 'supabase/pending/staff_booking_finalize.sql',
    'supabase/pending/staff_guest_level.sql', 'supabase/pending/product_private_tariff_rules.sql']) {
    const res = psqlFile(f); if (res.status !== 0) throw new Error(`psql ${f}: ${res.stderr}`);
  }
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-25' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES ('${P}','Privat Ski','private',120,0,'${S}',true);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES
      ${I.map((x, n) => `('${x}','L${n}','Synth','active','{ski}')`).join(',')};
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid'),('${CUST2}','Andere','Familie','f@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES
      ('${ANNA}','${CUST}','Anna','Synth','2010-02-02'),('${BEN}','${CUST}','Ben','Synth','2012-03-03'),
      ('${CARL}','${CUST}','Carl','Synth','2011-04-04'),('${FOREIGN}','${CUST2}','Fremd','Andere','2011-01-01');
    INSERT INTO private_lesson_discount_rule(percent,threshold_minutes,provenance) VALUES (10,240,'fixture = PROPOSED seed');
  `);
  await sql`SELECT save_product_private_tariff_rules(${P}::uuid, 0, ${sql.json(MALBUN)}::jsonb, ${ACTOR}::uuid)`;

  const slot = (date, s, e, ins) => ({ date, time_start: s, time_end: e, instructor_id: ins });
  const ids = (parts) => parts.map((x) => ({ participant_id: x }));
  const quote = async (appts, parts, extra = {}) => (await sql`SELECT pa_create_quote(${sql.json({
    product_id: P, persons: parts.length, customer_id: CUST, participant_ids: parts, appointments: appts.map(({ date, time_start, time_end }) => ({ date, time_start, time_end })), ...extra,
  })}::jsonb) r`)[0].r;
  let k = 0; const key = () => `b07p3-${++k}-${Date.now()}`;
  // Create exactly as the Office does: bind to the revisions + day context of the quote it showed.
  const createFrom = async (q, appts, parts, more = {}, db = sql) => (await db`SELECT pa_create_booking_finalized(${sql.json({
    submission_key: more.submission_key ?? key(), customer_id: CUST, product_id: P, appointments: appts, participants: ids(parts),
    quote_revision: q.revision, discount_rule_revision: q.discount_rule_revision, day_context_digest: q.day_context_digest, ...more,
  })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
  const book = async (appts, parts, more = {}) => {
    const q = await quote(appts, parts, more.discount_override ? { discount_override: { percent: more.discount_override.percent } } : {});
    assert.equal(q.ok, true, JSON.stringify(q));
    const c = await createFrom(q, appts, parts, more); assert.equal(c.ok, true, JSON.stringify(c)); return { q, c };
  };
  // Byte-level snapshot of everything an earlier booking owns (lines, appointments, pricing, history, payments, invoices).
  const snap = async (ticket) => (await sql`SELECT jsonb_build_object(
      't', (SELECT to_jsonb(x) FROM tickets x WHERE id = ${ticket}),
      'i', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM ticket_items x WHERE ticket_id = ${ticket}),
      'a', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM private_appointments x WHERE ticket_id = ${ticket}),
      'pr', (SELECT jsonb_agg(to_jsonb(x) ORDER BY appointment_id) FROM private_appointment_pricing x WHERE appointment_id IN (SELECT id FROM private_appointments WHERE ticket_id = ${ticket})),
      'h', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM ticket_history x WHERE ticket_id = ${ticket}),
      'pay', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM payments x WHERE ticket_id = ${ticket}),
      'inv', (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM invoices x WHERE ticket_id = ${ticket}))::text s`)[0].s;
  const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) t, (SELECT count(*)::int FROM ticket_items) i,
    (SELECT count(*)::int FROM private_appointments) a, (SELECT count(*)::int FROM customer_participants) p, (SELECT count(*)::int FROM ticket_history) h`)[0];

  await t('grants: day-context helper and 5-arg resolver are service-only', async () => {
    for (const f of ['pa_private_day_context(uuid[],date[])', 'pa_price_request(uuid,jsonb,jsonb,boolean,jsonb)']) {
      for (const role of ['anon', 'authenticated']) assert.equal((await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`)[0].ok, false, `${role} ${f}`);
      assert.equal((await sql`SELECT has_function_privilege('service_role', ${'public.' + f}, 'EXECUTE') ok`)[0].ok, true);
    }
  });

  let first;
  await t('separate booking: Anna 2h (ticket 1) + new 2h same day => new line 10% (19.00); ticket 1 bytes unchanged', async () => {
    first = await book([slot('2026-12-07', '10:00', '12:00', I[0])], [ANNA]);
    assert.equal(n2(first.c.total), 190); assert.equal(first.q.discount_source, 'none');
    const before = await snap(first.c.ticket_id);
    const { q, c } = await book([slot('2026-12-07', '14:00', '16:00', I[1])], [ANNA]);
    assert.equal(q.existing_appointments, 1);
    assert.deepEqual(q.items.map((x) => [x.eligible, x.persons, n2(x.discount_amount)]), [[1, 1, 19]]);
    assert.equal(n2(c.total), 171); assert.equal(c.discount_source, 'automatic');
    assert.equal(await snap(first.c.ticket_id), before);
    const [pr] = await sql`SELECT discount_source, discount_amount, eligible_persons FROM private_appointment_pricing WHERE appointment_id = ${c.appointment_ids[0]}`;
    assert.deepEqual([pr.discount_source, n2(pr.discount_amount), pr.eligible_persons], ['automatic', 19, 1]);
    const [h] = await sql`SELECT details FROM ticket_history WHERE ticket_id = ${c.ticket_id} AND event_type = 'PRIVATE_APPOINTMENT_CHANGED'`;
    assert.equal(h.details.existing_same_day_appointments, 1); assert.equal(h.details.discount_source, 'automatic');
  });

  await t('different dates / different people are never summed', async () => {
    const d = await quote([slot('2026-12-08', '14:00', '16:00', I[1])], [ANNA]); // Anna's 2h is on 07.12.
    assert.equal(d.existing_appointments, 0); assert.equal(n2(d.discount_total), 0);
    const p = await quote([slot('2026-12-07', '12:00', '14:00', I[2])], [BEN]); // Anna's 4h never helps Ben
    assert.equal(p.existing_appointments, 0); assert.equal(n2(p.discount_total), 0);
  });

  await t('cancelled appointment, cancelled line, cancelled/draft ticket do not count', async () => {
    const day = '2026-12-09';
    const mk = async (s, e, ins) => (await book([slot(day, s, e, ins)], [CARL])).c;
    const a1 = await mk('09:00', '10:00', I[0]); const a2 = await mk('10:00', '12:00', I[1]); const a3 = await mk('12:00', '14:00', I[2]);
    await sql`UPDATE private_appointments SET status = 'cancelled' WHERE ticket_id = ${a1.ticket_id}`;
    await sql`UPDATE ticket_items SET status = 'cancelled' WHERE ticket_id = ${a2.ticket_id}`;
    await sql`UPDATE tickets SET status = 'draft' WHERE id = ${a3.ticket_id}`;
    const q = await quote([slot(day, '14:00', '16:00', I[3])], [CARL]);
    assert.equal(q.existing_appointments, 0); assert.equal(n2(q.discount_total), 0);
    await sql`UPDATE tickets SET status = 'cancelled' WHERE id = ${a3.ticket_id}`;
    assert.equal((await quote([slot(day, '14:00', '16:00', I[3])], [CARL])).existing_appointments, 0);
    await sql`UPDATE tickets SET status = 'confirmed' WHERE id = ${a3.ticket_id}`; // 12-14 counts again (2h + new 2h)
    const q2 = await quote([slot(day, '14:00', '16:00', I[3])], [CARL]);
    assert.equal(q2.existing_appointments, 1); assert.equal(n2(q2.discount_total), 19);
  });

  await t('shared 230: Anna has 2h in another booking, new shared 2h Anna+Ben => Anna share 115, 11.50 off, 218.50', async () => {
    const day = '2026-12-10';
    await book([slot(day, '10:00', '12:00', I[0])], [ANNA]);
    const q = await quote([slot(day, '14:00', '16:00', I[1])], [BEN, ANNA]);
    assert.deepEqual(q.items.map((x) => [n2(x.price), x.persons, x.eligible, n2(x.discount_amount), n2(x.net)]), [[230, 2, 1, 11.5, 218.5]]);
    const rev = await quote([slot(day, '14:00', '16:00', I[1])], [ANNA, BEN]);
    assert.equal(n2(rev.total), 218.5); assert.equal(rev.day_context_digest, q.day_context_digest); // order-invariant
    const c = await createFrom(q, [slot(day, '14:00', '16:00', I[1])], [BEN, ANNA]);
    assert.equal(n2(c.total), 218.5);
  });

  await t('manual override replaces cross-booking automatic discount (5% / explicit 0), never added; reason required', async () => {
    const day = '2026-12-11';
    await book([slot(day, '10:00', '12:00', I[0])], [ANNA]);
    const appts = [slot(day, '14:00', '16:00', I[1])];
    const auto = await quote(appts, [ANNA]); assert.equal(n2(auto.discount_total), 19);
    const five = await quote(appts, [ANNA], { discount_override: { percent: 5 } });
    assert.equal(five.discount_source, 'manual'); assert.equal(n2(five.discount_total), 9.5); assert.equal(n2(five.automatic_discount_total), 19);
    const zero = await quote(appts, [ANNA], { discount_override: { percent: 0 } });
    assert.equal(zero.discount_source, 'manual'); assert.equal(n2(zero.total), 190);
    const noReason = await createFrom(zero, appts, [ANNA], { discount_override: { percent: 0 } });
    assert.equal(noReason.error, 'invalid'); assert.equal(noReason.field, 'discount_reason');
    const c = await createFrom(zero, appts, [ANNA], { discount_override: { percent: 0, reason: 'Kulanz: kein Rabatt' } });
    assert.equal(n2(c.total), 190);
    const [li] = await sql`SELECT discount_percent, discount_reason FROM ticket_items WHERE appointment_id = ${c.appointment_ids[0]}`;
    assert.deepEqual([Number(li.discount_percent), li.discount_reason], [0, 'Kulanz: kein Rabatt']);
  });

  await t('duplicate joins and overlapping existing lessons count once (union of minutes, not sum)', async () => {
    const day = '2026-12-12';
    const x = (await book([slot(day, '10:00', '12:00', I[0])], [BEN])).c;
    const y = (await book([slot(day, '10:00', '12:00', I[1])], [BEN])).c; // same person, overlapping (source data)
    // duplicate join row as found in imported source data (guard bypassed only for this synthetic fixture row)
    await sql.begin(async (tx) => { await tx`SET LOCAL session_replication_role = replica`;
      await tx`INSERT INTO private_appointment_participants(appointment_id, participant_id) VALUES (${x.appointment_ids[0]}, ${BEN})`; });
    const ctx = (await sql`SELECT pa_private_day_context(${[BEN]}::uuid[], ${[day]}::date[]) c`)[0].c;
    assert.equal(ctx.appointments, 2); assert.equal(ctx.slots.length, 2);
    const q = await quote([slot(day, '12:00', '13:00', I[2])], [BEN]); // union 2h + 1h = 3h < 4h (a sum would be 5h)
    assert.equal(n2(q.discount_total), 0);
    const q4 = await quote([slot(day, '12:00', '14:00', I[2])], [BEN]); // union 2h + 2h = 4h
    assert.equal(n2(q4.discount_total), 15);
    void y;
  });

  await t('stale day context: another booking or a cancellation after the quote => quote_changed, nothing written', async () => {
    const day = '2026-12-14';
    const appts = [slot(day, '14:00', '16:00', I[1])];
    const q = await quote(appts, [ANNA]); assert.equal(n2(q.discount_total), 0);
    await book([slot(day, '10:00', '12:00', I[0])], [ANNA]); // concurrent office booking for Anna, same day
    const before = await counts();
    const stale = await createFrom(q, appts, [ANNA]);
    assert.equal(stale.error, 'quote_changed'); assert.equal(stale.reason, 'day_context');
    assert.deepEqual(await counts(), before);
    const fresh = await quote(appts, [ANNA]); assert.equal(n2(fresh.discount_total), 19);
    // cancellation of the counted lesson after the quote also invalidates it
    const [{ id: cid }] = await sql`SELECT a.id FROM private_appointments a JOIN private_appointment_participants p ON p.appointment_id = a.id
      WHERE p.participant_id = ${ANNA} AND a.date = ${day}`;
    await sql`UPDATE private_appointments SET status = 'cancelled' WHERE id = ${cid}`;
    const again = await createFrom(fresh, appts, [ANNA]);
    assert.equal(again.error, 'quote_changed'); assert.deepEqual(await counts(), before);
    const missing = await createFrom({ ...fresh, day_context_digest: undefined }, appts, [ANNA]);
    assert.equal(missing.error, 'invalid'); assert.equal(missing.field, 'day_context_digest');
  });

  await t('stale context rolls back guests created by the attempt', async () => {
    const day = '2026-12-15';
    const appts = [slot(day, '14:00', '16:00', I[1])];
    const q = await quote(appts, [ANNA, 'x'].slice(0, 1)); // Anna known; guest added below
    const q2 = await sql`SELECT pa_create_quote(${sql.json({ product_id: P, persons: 2, customer_id: CUST, participant_ids: [ANNA],
      appointments: [{ date: day, time_start: '14:00', time_end: '16:00' }] })}::jsonb) r`;
    await book([slot(day, '10:00', '12:00', I[0])], [ANNA]);
    const before = await counts();
    const res = (await sql`SELECT pa_create_booking(${sql.json({ submission_key: key(), customer_id: CUST, product_id: P, appointments: appts,
      participants: [{ participant_id: ANNA }, { guest_key: 'g-new', first_name: 'Neu', birth_date: '2014-05-05' }],
      quote_revision: q2[0].r.revision, discount_rule_revision: q2[0].r.discount_rule_revision, day_context_digest: q2[0].r.day_context_digest })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(res.error, 'quote_changed'); assert.deepEqual(await counts(), before);
    void q;
  });

  await t('replay: same submission key returns the first result unchanged, even after the day context changed', async () => {
    const day = '2026-12-16'; const sk = key();
    const appts = [slot(day, '14:00', '16:00', I[1])];
    const q = await quote(appts, [ANNA]);
    const c1 = await createFrom(q, appts, [ANNA], { submission_key: sk });
    await book([slot(day, '10:00', '12:00', I[0])], [ANNA]);
    const before = await counts(); const s1 = await snap(c1.ticket_id);
    const c2 = await createFrom(q, appts, [ANNA], { submission_key: sk });
    assert.equal(c2.replayed, true); assert.equal(c2.ticket_id, c1.ticket_id); assert.equal(n2(c2.total), 190);
    assert.deepEqual(await counts(), before); assert.equal(await snap(c1.ticket_id), s1);
  });

  await t('competing creates for the same person/day serialize: second waits, then quote_changed; first never mutated', async () => {
    const day = '2026-12-17';
    const a1 = [slot(day, '10:00', '12:00', I[0])], a2 = [slot(day, '14:00', '16:00', I[1])];
    const q1 = await quote(a1, [ANNA]), q2 = await quote(a2, [ANNA]);
    assert.equal(q1.day_context_digest, q2.day_context_digest);
    let second;
    const out = await sql.begin(async (tx) => {
      const c1 = await createFrom(q1, a1, [ANNA], {}, tx);
      second = createFrom(q2, a2, [ANNA]); // other connection
      const raced = await Promise.race([second.then(() => 'done'), new Promise((ok) => setTimeout(() => ok('blocked'), 400))]);
      return { c1, raced };
    });
    assert.equal(out.c1.ok, true); assert.equal(out.raced, 'blocked');
    const r2 = await second; assert.equal(r2.error, 'quote_changed');
    const s = await snap(out.c1.ticket_id);
    const fresh = await quote(a2, [ANNA]); const ok = await createFrom(fresh, a2, [ANNA]);
    assert.equal(n2(ok.total), 171); assert.equal(await snap(out.c1.ticket_id), s);
  });

  await t('identity: only stable ids count; foreign/unknown ids rejected; a guest matched by name gets no history', async () => {
    const bad = await quote([slot('2026-12-07', '12:00', '14:00', I[2])], [FOREIGN]);
    assert.equal(bad.error, 'invalid'); assert.equal(bad.field, 'participant_ids');
    const dup = await sql`SELECT pa_create_quote(${sql.json({ product_id: P, persons: 2, customer_id: CUST, participant_ids: [ANNA, ANNA],
      appointments: [{ date: '2026-12-07', time_start: '12:00', time_end: '14:00' }] })}::jsonb) r`;
    assert.equal(dup[0].r.error, 'invalid');
    // Anna has 4h on 07.12.; an anonymous guest quote with persons=1 never sees it.
    const anon = (await sql`SELECT pa_create_quote(${sql.json({ product_id: P, persons: 1, appointments: [{ date: '2026-12-07', time_start: '12:00', time_end: '13:00' }] })}::jsonb) r`)[0].r;
    assert.equal(anon.existing_appointments, 0); assert.equal(n2(anon.discount_total), 0);
    const res = (await sql`SELECT pa_create_booking(${sql.json({ submission_key: key(), customer_id: CUST, product_id: P,
      appointments: [slot('2026-12-07', '12:00', '13:00', I[2])],
      participants: [{ guest_key: 'g-anna', first_name: 'Anna', last_name: 'Synth', birth_date: '2010-02-02' }],
      quote_revision: anon.revision, discount_rule_revision: anon.discount_rule_revision, day_context_digest: anon.day_context_digest })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(res.ok, true, JSON.stringify(res)); assert.equal(n2(res.total), 75); // name match reuses Anna's row, no credited history
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}
