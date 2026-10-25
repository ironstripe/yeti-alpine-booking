// Real SQL tests for supabase/pending/product_private_tariff_rules.sql (B07-P):
// one product-configured resolver for preview (pa_create_quote) and new create (pa_create_booking[_finalized]).
// Throwaway local PostgreSQL only: schema-only production baseline + installed pending lineage + synthetic data.
// Prices below are SYNTHETIC CONFIG DATA (fixture rows), never code branches.
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/productPrivateTariffRules.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `pp_tariff_rules_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), A = id(0xa0), B = id(0xb0), NOCFG = id(0xc0), GROUP = id(0xd0), ACTOR = id(0xbeef);
const CUST = id(0xc1), OTHER = id(0xc2), P1 = id(0xe1), P2 = id(0xe2), PF = id(0xe9), I1 = id(0xf001), I2 = id(0xf002);
const D1 = '2026-12-14', D2 = '2026-12-15', D3 = '2026-12-16';

const rule = (o) => ({ extra_person_chf: 0, max_persons: 4, max_block_minutes: null, office_only: false, provenance: 'synthetic fixture', ...o });
const CONFIG_A = [
  rule({ rule_kind: 'hourly', window_start: '09:00', window_end: '10:00', price_chf: 75, extra_person_chf: 20 }),
  rule({ rule_kind: 'hourly', window_start: '12:00', window_end: '14:00', price_chf: 75, extra_person_chf: 20 }),
  rule({ rule_kind: 'hourly', window_start: '10:00', window_end: '12:00', price_chf: 85, extra_person_chf: 20, max_block_minutes: 60, office_only: true }),
  rule({ rule_kind: 'hourly', window_start: '14:00', window_end: '16:00', price_chf: 85, extra_person_chf: 20, max_block_minutes: 60, office_only: true }),
  rule({ rule_kind: 'exact_block', window_start: '10:00', window_end: '12:00', price_chf: 190, extra_person_chf: 30 }),
];
const CONFIG_B = [rule({ rule_kind: 'hourly', window_start: '08:00', window_end: '17:00', price_chf: 99 })];

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
    'supabase/pending/staff_guest_level.sql', 'supabase/pending/product_private_tariff_rules.sql']) {
    const r = psqlFile(f); if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-25' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES
      ('${A}','Privat A','private',120,0,'${S}',true),('${B}','Privat B','private',60,0,'${S}',true),
      ('${NOCFG}','Privat ohne Tarif','private',60,0,'${S}',true),('${GROUP}','Gruppe','group',120,0,'${S}',true);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ('${I1}','A','Eins','active','{ski}'),('${I2}','B','Zwei','active','{ski}');
    -- Legacy global rates exist (as in production) and must NOT be used for B07-P create.
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('08:00','17:00',80);
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid'),('${OTHER}','O','K','o@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES
      ('${P1}','${CUST}','Lea','Synth','2016-02-02'),('${P2}','${CUST}','Tom','Synth','2014-03-03'),('${PF}','${OTHER}','X','Y','2015-01-01');
    INSERT INTO private_lesson_discount_rule(percent,threshold_minutes,provenance) VALUES (10,240,'synthetic fixture');
  `);

  const save = async (product, expected, rules) => (await sql`SELECT save_product_private_tariff_rules(${product}::uuid, ${expected}::int, ${sql.json(rules)}::jsonb, ${ACTOR}::uuid) r`)[0].r;
  const quote = async (product, appts, persons = 1) => (await sql`SELECT pa_create_quote(${sql.json({ product_id: product, persons, appointments: appts })}::jsonb) r`)[0].r;
  let k = 0; const key = () => `b07p-${++k}-${Date.now()}`;
  const slot = (date, s, e, ins = I1) => ({ date, time_start: s, time_end: e, instructor_id: ins });
  const create = async (product, appts, extra = {}) => (await sql`SELECT pa_create_booking_finalized(${sql.json({
    submission_key: extra.submission_key ?? key(), customer_id: CUST, product_id: product, appointments: appts,
    participants: extra.participants ?? [{ participant_id: P1 }], discount_rule_revision: 1, ...extra.more,
  })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
  const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) t, (SELECT count(*)::int FROM ticket_items) i,
    (SELECT count(*)::int FROM private_appointments) a, (SELECT count(*)::int FROM customer_participants) p`)[0];

  await t('grants: resolver/quote/save/create service_role only; tables SELECT-only for authenticated', async () => {
    for (const f of ['pa_product_quote(uuid,date,time,time,integer,boolean)', 'pa_create_quote(jsonb)',
      'save_product_private_tariff_rules(uuid,integer,jsonb,uuid)', 'pa_create_booking(jsonb,uuid)']) {
      for (const role of ['anon', 'authenticated']) {
        const [{ ok }] = await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`;
        assert.equal(ok, false, `${role} ${f}`);
      }
      const [{ ok }] = await sql`SELECT has_function_privilege('service_role', ${'public.' + f}, 'EXECUTE') ok`;
      assert.equal(ok, true, f);
    }
    for (const tb of ['product_private_tariff_rules', 'product_private_tariff_revisions']) {
      const [r] = await sql`SELECT has_table_privilege('authenticated', ${'public.' + tb}, 'SELECT') s, has_table_privilege('authenticated', ${'public.' + tb}, 'INSERT') i, has_table_privilege('anon', ${'public.' + tb}, 'SELECT') a`;
      assert.deepEqual([r.s, r.i, r.a], [true, false, false], tb);
    }
  });

  await t('unconfigured product: preview and create are unavailable (no zero, no global 80 fallback), nothing written', async () => {
    const q = await quote(NOCFG, [slot(D1, '09:00', '10:00')]);
    assert.equal(q.error, 'tariff_unavailable'); assert.equal(q.reason, 'not_configured');
    const before = await counts();
    const r = await create(NOCFG, [slot(D1, '09:00', '10:00')], { more: { quote_revision: 0 } });
    assert.equal(r.error, 'tariff_unavailable');
    assert.deepEqual(await counts(), before);
  });

  await t('save config A (rev 1) and B (rev 1); stale expected revision rejected', async () => {
    const a = await save(A, 0, CONFIG_A); assert.equal(a.ok, true, JSON.stringify(a)); assert.equal(a.revision, 1); assert.equal(a.rules.length, 5);
    const b = await save(B, 0, CONFIG_B); assert.equal(b.revision, 1);
    const stale = await save(A, 0, CONFIG_A); assert.equal(stale.error, 'stale'); assert.equal(stale.revision, 1);
  });

  await t('invalid configs rejected atomically (overlap, bad kind, missing provenance, non-private product)', async () => {
    const overlap = await save(A, 1, [...CONFIG_A, rule({ rule_kind: 'hourly', window_start: '09:00', window_end: '11:00', price_chf: 70 })]);
    assert.equal(overlap.error, 'invalid'); assert.match(overlap.message, /overlapping_hourly/);
    assert.equal((await save(A, 1, [rule({ rule_kind: 'daily', window_start: '09:00', window_end: '10:00', price_chf: 1 })])).error, 'invalid');
    assert.equal((await save(A, 1, [rule({ rule_kind: 'hourly', window_start: '09:00', window_end: '10:00', price_chf: 1, provenance: ' ' })])).error, 'invalid');
    assert.equal((await save(A, 1, [rule({ rule_kind: 'hourly', window_start: '09:30', window_end: '10:30', price_chf: 1 })])).error, 'invalid');
    assert.equal((await save(GROUP, 0, CONFIG_B)).error, 'invalid');
    const [{ n }] = await sql`SELECT count(*)::int n FROM product_private_tariff_rules WHERE product_id=${A}`;
    assert.equal(n, 5);
    const [{ revision }] = await sql`SELECT revision FROM product_private_tariff_revisions WHERE product_id=${A}`;
    assert.equal(revision, 1);
  });

  await t('preview A: outside rush 75, rush single-hour exception 85, exact 10-12 = 190 (not 2x85), 2 persons from config', async () => {
    const q = await quote(A, [slot(D1, '09:00', '10:00'), slot(D1, '10:00', '11:00'), slot(D2, '10:00', '12:00'), slot(D2, '12:00', '14:00')]);
    assert.equal(q.ok, true, JSON.stringify(q));
    assert.deepEqual(q.items.map((x) => [Number(x.price), x.mode]), [[75, 'hourly'], [85, 'hourly'], [190, 'exact_block'], [150, 'hourly']]);
    assert.equal(Number(q.gross_total), 500); assert.equal(q.revision, 1);
    // D2 has 10-12 + 12-14 = 240 min for the same person => configured automatic 10% on those two lines only.
    assert.equal(Number(q.discount_total), 34); assert.equal(Number(q.total), 466); assert.equal(q.discount_source, 'automatic');
    const two = await quote(A, [slot(D2, '10:00', '12:00'), slot(D1, '09:00', '10:00')], 2);
    assert.deepEqual(two.items.map((x) => Number(x.price)), [220, 95]);
  });

  await t('A ambiguity/gaps fail closed: 14-16 double (no exact rule), 11-13 cross-window, 10:30 start, 16-17 no rule, 5 persons', async () => {
    assert.equal((await quote(A, [slot(D1, '14:00', '16:00')])).reason, 'block_not_allowed');
    assert.equal((await quote(A, [slot(D1, '11:00', '13:00')])).reason, 'block_not_allowed');
    assert.equal((await quote(A, [slot(D1, '10:30', '11:30')])).reason, 'no_rule');
    assert.equal((await quote(A, [slot(D1, '16:00', '17:00')])).reason, 'no_rule');
    assert.equal((await quote(A, [slot(D1, '09:00', '10:00')], 5)).error, 'invalid');
    const r = await sql`SELECT pa_product_quote(${A}, ${D1}, '10:00', '11:00', 1, false) r`;
    assert.equal(r[0].r.reason, 'office_only'); // rush single-hour is an office exception only
    const ex = await sql`SELECT pa_product_quote(${A}, ${D1}, '10:00', '12:00', 1, false) r`;
    assert.equal(Number(ex[0].r.price), 190); // standard double lesson is not an exception
  });

  let aTicket;
  await t('create A (2 persons): stored prices equal preview (190+30, 75+20), zero-teacher assign-later allowed, canonical participants, revision bound', async () => {
    const appts = [slot(D3, '10:00', '12:00'), { date: D3, time_start: '12:00', time_end: '13:00', assign_later: true }];
    const q = await quote(A, appts, 2);
    const r = await create(A, appts, { participants: [{ participant_id: P1 }, { guest_key: 'guest-abcdefgh', first_name: 'Neu', birth_date: '2015-05-05' }],
      more: { quote_revision: q.revision } });
    assert.equal(r.ok, true); assert.ok(r.ticket_id, JSON.stringify(r)); assert.equal(r.tariff_revision, 1);
    aTicket = r.ticket_id;
    const rows = await sql`SELECT a.price, ti.unit_price, ti.instructor_id, ti.product_id, (SELECT count(*)::int FROM private_appointment_participants m WHERE m.appointment_id=a.id) n
      FROM private_appointments a JOIN ticket_items ti ON ti.appointment_id=a.id WHERE a.ticket_id=${aTicket} ORDER BY a.time_start`;
    assert.deepEqual(rows.map((x) => [Number(x.price), Number(x.unit_price), x.n]), [[220, 220, 2], [95, 95, 2]]);
    assert.equal(rows[1].instructor_id, null);
    assert.equal(Number(r.total), Number(q.total));
    const [{ total_amount }] = await sql`SELECT total_amount FROM tickets WHERE id=${aTicket}`;
    assert.equal(Number(total_amount), 315);
  });

  await t('create requires quote_revision; stale revision => quote_changed, nothing written', async () => {
    const before = await counts();
    assert.equal((await create(A, [slot(D1, '09:00', '10:00', I2)])).field, 'quote_revision');
    const r = await create(A, [slot(D1, '09:00', '10:00', I2)], { more: { quote_revision: 0 } });
    assert.equal(r.error, 'quote_changed'); assert.equal(r.quote.revision, 1);
    assert.deepEqual(await counts(), before);
  });

  await t('tariff failure after guest mapping rolls back guests/ticket (plain pa_create_booking too)', async () => {
    const before = await counts();
    const r = (await sql`SELECT pa_create_booking(${sql.json(await withCtx({ submission_key: key(), customer_id: CUST, product_id: A, quote_revision: 1, discount_rule_revision: 1,
      appointments: [slot(D1, '14:00', '16:00', I2)], participants: [{ guest_key: 'guest-rollback1', first_name: 'Weg', birth_date: '2015-01-01' }] }))}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(r.error, 'tariff_unavailable'); assert.equal(r.reason, 'block_not_allowed'); assert.equal(r.index, 0);
    assert.deepEqual(await counts(), before);
  });

  await t('editing A config changes new quote/create without code change; B and existing A booking unchanged', async () => {
    const edited = CONFIG_A.map((x) => (x.rule_kind === 'exact_block' ? { ...x, price_chf: 200 } : x));
    const s = await save(A, 1, edited); assert.equal(s.revision, 2);
    const q = await quote(A, [slot(D1, '10:00', '12:00')]);
    assert.equal(Number(q.total), 200); assert.equal(q.revision, 2);
    const old = await create(A, [slot(D1, '10:00', '12:00', I2)], { more: { quote_revision: 1 } });
    assert.equal(old.error, 'quote_changed');
    const r = await create(A, [slot(D1, '10:00', '12:00', I2)], { more: { quote_revision: 2 } });
    assert.equal(Number(r.total), 200);
    const hist = await sql`SELECT price FROM private_appointments WHERE ticket_id=${aTicket} ORDER BY time_start`;
    assert.deepEqual(hist.map((x) => Number(x.price)), [220, 95]);
    const qb = await quote(B, [slot(D1, '10:00', '12:00')]);
    assert.equal(Number(qb.total), 198); assert.equal(qb.revision, 1);
  });

  await t('replay of the same submission returns same ticket even after a later config change; no duplicate', async () => {
    const sk = key();
    const r1 = await create(B, [slot(D2, '15:00', '16:00', I2)], { submission_key: sk, more: { quote_revision: 1 } });
    await save(B, 1, [rule({ rule_kind: 'hourly', window_start: '08:00', window_end: '17:00', price_chf: 120 })]);
    const before = await counts();
    const r2 = await create(B, [slot(D2, '15:00', '16:00', I2)], { submission_key: sk, more: { quote_revision: 1 } });
    assert.equal(r2.replayed, true); assert.equal(r2.ticket_id, r1.ticket_id); assert.equal(Number(r2.total), 99);
    assert.deepEqual(await counts(), before);
  });

  await t('existing participant ownership/conflict guards unchanged', async () => {
    const foreign = await create(A, [slot(D2, '09:00', '10:00', I2)], { participants: [{ participant_id: PF }], more: { quote_revision: 2 } });
    assert.equal(foreign.error, 'invalid'); assert.equal(foreign.field, 'participants');
    const clash = await create(A, [slot(D3, '10:00', '12:00', I1)], { more: { quote_revision: 2 } });
    assert.equal(clash.error, 'conflict');
  });

  await t('concurrent config save waits for an in-flight create (FOR SHARE) and bumps revision after it', async () => {
    const res = await sql.begin(async (tx) => {
      const r = (await tx`SELECT pa_create_booking(${sql.json(await withCtx({ submission_key: key(), customer_id: CUST, product_id: A, quote_revision: 2, discount_rule_revision: 1,
        appointments: [slot('2026-12-17', '09:00', '10:00', I1)], participants: [{ participant_id: P2 }] }))}::jsonb, ${ACTOR}::uuid) r`)[0].r;
      const pending = save(A, 2, CONFIG_A); // separate connection; must block on the revision row
      const raced = await Promise.race([pending.then(() => 'done'), new Promise((ok) => setTimeout(() => ok('blocked'), 400))]);
      return { r, raced, pending };
    });
    assert.equal(res.raced, 'blocked'); assert.ok(res.r.ticket_id);
    const after = await res.pending; assert.equal(after.revision, 3);
  });
} finally {
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  await sql.end(); await admin.unsafe(`DROP DATABASE ${dbName}`); await admin.end();
}
if (passed !== results.length || results.length === 0) process.exit(1);
