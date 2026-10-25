// B07b real SQL tests on the FULL combined pending chain (+ b07_private_activation_guard.sql):
// private activation guard, targeted 26/27 seed/activation script, and persistence of the request
// captured from the real wizard builder (tests/fixtures/b07b_captured_cart.json, written by
// tests/officeCartRequest.test.ts). Throwaway local PostgreSQL, synthetic data only.
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/b07bActivationCart.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `b07b_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 5 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

const CHAIN = ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql',
  ...readdirSync(fileURLToPath(new URL('drizzle/migrations/', root))).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort().map((f) => `drizzle/migrations/${f}`),
  'supabase/pending/b04_delivery_compatibility.sql', 'supabase/pending/b06_invoice_delivery.sql', 'supabase/pending/b11_created_total_event.sql',
  'supabase/pending/participant_birth_date_guard.sql', 'supabase/pending/group_lunch_full_day.sql', 'supabase/pending/group_lunch_season.sql',
  'supabase/pending/pa_edit_booking.sql', 'supabase/pending/b05_office_confirmation_intent.sql',
  'supabase/pending/product_private_tariff_rules.sql', 'supabase/pending/pa_tariff_l1.sql', 'supabase/pending/b07a_office_multi_create.sql',
  'supabase/pending/b07_private_activation_guard.sql'];

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = 'f185b448-e6aa-46b8-94ae-0875a7a6c166', OLD = id(2);
const SKI = '3646f155-8a66-53e3-b512-749f3a42c1ae', SB = '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1';
const PX = id(0xa9), GX = id(0xaa), P4 = id(0xa4), LUNCH = id(0xa5), ACTOR = id(0xbeef);
const CUST = id(0xc1), ANNA = id(0xe1), BEN = id(0xe2), C_NOMP = id(0x150);
const I = [1, 2, 3].map((n) => id(0xf000 + n));
const WEEK = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'];
const OLD_PRODUCTS = [['Private Lektion Ski 2h', 0], ['Private Lektion Snowboard 2h', 0], ['Privatstunde', 75], ['Privatstunde 85', 85], ['Schulatrif', 60]];
const n2 = (x) => Math.round(Number(x) * 100) / 100;

try {
  for (const f of CHAIN) { const res = psqlFile(f); if (res.status !== 0) throw new Error(`psql ${f}: ${res.stderr}`); }
  results.push(`     installed together: ${CHAIN.length} files`);
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-25' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO user_roles(user_id, role) VALUES ('${ACTOR}','office');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15'),('${OLD}','Winter 25/26','2025-12-01','2026-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES
      ('${SKI}','Privatunterricht Ski','private',55,0,'${S}',false),('${SB}','Privatunterricht Snowboard','private',60,0,'${S}',false),
      ('${PX}','Privat Teilabdeckung','private',60,0,'${S}',false),('${GX}','Gruppe ohne Varianten','group',240,0,'${S}',false),
      ('${P4}','26/27 Kinder Ganztag','group',240,0,'${S}',true),('${LUNCH}','Mittagsbetreuung','lunch',NULL,30,'${S}',true);
    INSERT INTO products(name,type,duration_minutes,price,season_id,is_active) VALUES
      ${OLD_PRODUCTS.map(([n, p]) => `('${n}','private',60,${p},'${OLD}',true)`).join(',')};
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ${I.map((x, n) => `('${x}','L${n}','Synth','active','{ski}')`).join(',')};
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES
      ('${ANNA}','${CUST}','Anna','Synth','2016-02-02'),('${BEN}','${CUST}','Ben','Synth','2017-03-03');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('09:00','17:00',80);
  `);
  for (const P of [SKI, SB, PX, GX]) for (const k of [1])
    await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
      VALUES (${`src-${P}-${k}`},${S},${P},'sha','Privat','draft',${k},60,1,${100 + k},'{}')`;
  const TIERS = [150, 200, 245, 285, 320];
  for (let d = 1; d <= 5; d++) {
    await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES (${P4},${d},${TIERS[d - 1]})`;
    await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
      VALUES (${'src-4h-' + d},${S},${P4},'sha','Kinderkurs','draft',${d},240,1,${TIERS[d - 1]},'{"group_capacity":4}')`;
  }
  await sql`INSERT INTO group_courses(id,name,discipline,min_age,max_age,price_per_day,is_active,product_id,course_type,meeting_point,max_participants)
    VALUES (${C_NOMP},'Ski Kids',${'ski'},4,16,0,true,${P4},'weekly',NULL,8)`;
  for (const d of WEEK) for (const [a, b] of [['10:00', '12:00'], ['14:00', '16:00']])
    await sql`INSERT INTO group_course_instances(course_id,date,start_time,end_time,status,current_participants) VALUES (${C_NOMP},${d},${a},${b},'scheduled',0)`;
  await sql`INSERT INTO bc_2627_course_product_variants(course_id,product_id,eligible_day_counts) VALUES (${C_NOMP},${P4},${[1, 2, 3, 4, 5]})`;

  const snapshot = async () => (await sql`SELECT
      (SELECT jsonb_agg(to_jsonb(p) - 'updated_at' ORDER BY name) FROM products p WHERE season_id = ${OLD}) old,
      (SELECT count(*)::int FROM bc_product_tariff_sources) src,
      (SELECT md5(string_agg(source_id || price_chf::text || import_status, ',' ORDER BY source_id)) FROM bc_product_tariff_sources) srcmd5`)[0];
  const activate = (P) => sql`UPDATE products SET is_active = true WHERE id = ${P}`;
  const before = await snapshot();

  await t('guard: BC private product cannot be activated without a tariff revision', async () => {
    await assert.rejects(activate(SKI), /cannot be activated before its product tariff covers/);
  });

  await t('guard: partial coverage (one decided window missing) still blocks', async () => {
    const rules = (await sql`SELECT rule_kind, to_char(window_start,'HH24:MI') window_start, to_char(window_end,'HH24:MI') window_end, office_only, max_block_minutes
      FROM private_tariff_required_coverage WHERE NOT (rule_kind='exact_block' AND window_start='09:00')`).map((r) => ({ ...r, price_chf: 1, extra_person_chf: 0, max_persons: 4, provenance: 'synthetic partial' }));
    const res = (await sql`SELECT save_product_private_tariff_rules(${PX}::uuid, 0, ${sql.json(rules)}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(res.error ?? null, null, JSON.stringify(res));
    await assert.rejects(activate(PX), /covers every decided window/);
    assert.equal((await sql`SELECT is_active FROM products WHERE id=${PX}`)[0].is_active, false);
  });

  await t('guard: group branch unchanged (group without variants still blocked; deactivate untouched)', async () => {
    await assert.rejects(activate(GX), /pricing release gate/);
    await sql`UPDATE products SET is_active = false WHERE id = ${P4}`; await sql`UPDATE products SET is_active = true WHERE id = ${P4}`;
  });

  await t('runtime check has no money constants; coverage is data only', async () => {
    const def = (await sql`SELECT pg_get_functiondef('public.private_tariff_activation_ok(uuid)'::regprocedure) d`)[0].d;
    assert.doesNotMatch(def, /\b(75|85|150|160|190)\b/);
    for (const role of ['anon', 'authenticated'])
      assert.equal((await sql`SELECT has_function_privilege(${role}, 'public.private_tariff_activation_ok(uuid)', 'EXECUTE') ok`)[0].ok, false);
  });

  await t('targeted PROPOSED script: seeds + activates exactly the two 26/27 products; old five and BC sources unchanged', async () => {
    const res = psqlFile('supabase/pending/b07_private_2627_activation.PROPOSED.sql');
    assert.equal(res.status, 0, res.stderr);
    const act = await sql`SELECT id, is_active, private_tariff_activation_ok(id) ok FROM products WHERE id IN (${SKI}, ${SB}) ORDER BY id`;
    assert.deepEqual(act.map((r) => [r.is_active, r.ok]), [[true, true], [true, true]]);
    assert.deepEqual(await snapshot(), before);
    assert.equal((await sql`SELECT count(*)::int n FROM product_private_tariff_revisions p JOIN products x ON x.id=p.product_id WHERE x.season_id=${OLD}`)[0].n, 0);
  });

  await t('targeted script refuses a second run (no reseed), nothing changes', async () => {
    const rev = await sql`SELECT product_id, revision FROM product_private_tariff_revisions ORDER BY product_id`;
    const res = psqlFile('supabase/pending/b07_private_2627_activation.PROPOSED.sql');
    assert.notEqual(res.status, 0); assert.match(res.stderr, /already has a tariff revision/);
    assert.deepEqual(await sql`SELECT product_id, revision FROM product_private_tariff_revisions ORDER BY product_id`, rev);
  });

  const multi = async (p, mode) => (await sql`SELECT b07a_office_multi(${sql.json(p)}::jsonb, ${ACTOR}::uuid, ${mode}) r`)[0].r;
  const captured = JSON.parse(readFileSync(new URL('./fixtures/b07b_captured_cart.json', import.meta.url), 'utf8'));
  const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) tk, (SELECT count(*)::int FROM ticket_items) ti,
    (SELECT count(*)::int FROM private_appointments) pa, (SELECT count(*)::int FROM customer_participants) cp, (SELECT count(*)::int FROM b07a_office_submissions) sub`)[0];
  const solo = (date, s, e, key) => ({ submission_key: key, customer_id: CUST, participants: [{ ref: 'a', participant_id: ANNA }],
    items: [{ kind: 'private', product_id: SKI, participants: ['a'], appointments: [{ date, time_start: s, time_end: e, instructor_id: I[2], meeting_point: 'malbipark' }] }] });
  const bookAck = async (p) => { const q = await multi(p, 'quote'); assert.equal(q.ok, true, JSON.stringify(q));
    const c = await multi({ ...p, acknowledged_quote_digest: q.quote.quote_digest, confirmation_requested: false }, 'create'); assert.equal(c.ok, true, JSON.stringify(c)); return { q, c }; };

  let capturedKey;
  await t('captured wizard request (private SKI+SB, group+lunch, guest) persists as one ticket matching its quote', async () => {
    capturedKey = `b07b-captured-${Date.now()}`;
    const p = { submission_key: capturedKey, ...captured };
    const pre = await counts();
    const { q, c } = await bookAck(p);
    const post = await counts();
    assert.deepEqual([post.tk - pre.tk, post.pa - pre.pa, post.cp - pre.cp, post.sub - pre.sub], [1, 2, 1, 1]);
    const tk = (await sql`SELECT * FROM tickets WHERE id = ${c.ticket_id}`)[0];
    assert.equal(n2(tk.total_amount), n2(q.quote.total)); assert.equal(n2(c.total), n2(q.quote.total));
    assert.equal(tk.participant_count, 3);
    assert.equal(String(tk.payment_due_date.toISOString().slice(0, 10)), '2026-12-01');
    const ls = await sql`SELECT ti.item_type, ti.product_id, ti.instructor_id, ti.line_total, pr.discount_source, pr.eligible_persons, pr.persons
      FROM ticket_items ti LEFT JOIN private_appointment_pricing pr ON pr.appointment_id = ti.appointment_id WHERE ti.ticket_id = ${c.ticket_id} ORDER BY ti.item_type, ti.time_start`;
    const privs = ls.filter((l) => l.item_type === 'private');
    assert.deepEqual(privs.map((l) => [l.product_id, l.instructor_id, l.persons, l.eligible_persons, l.discount_source]),
      [[SKI, I[0], 2, 1, 'automatic'], [SB, I[1], 1, 1, 'automatic']]);
    assert.equal(ls.filter((l) => l.item_type === 'lunch').length >= 1, true);
    const sum = ls.reduce((n, l) => n + Number(l.line_total), 0);
    assert.equal(n2(sum), n2(tk.total_amount));
    const ev = await sql`SELECT details FROM ticket_history WHERE ticket_id = ${c.ticket_id} AND event_type = 'PRIVATE_APPOINTMENT_CHANGED'`;
    assert.equal(ev.length, 1); assert.equal(n2(ev[0].details.ticket_total_after_create), n2(tk.total_amount));
  });

  await t('unknown outcome replay: same key + same request returns the stored result, nothing new', async () => {
    const pre = await counts();
    const q = await multi({ submission_key: capturedKey, ...captured }, 'quote');
    const again = q.ok ? await multi({ submission_key: capturedKey, ...captured, acknowledged_quote_digest: q.quote.quote_digest, confirmation_requested: false }, 'create')
      : await multi({ submission_key: capturedKey, ...captured, acknowledged_quote_digest: '0'.repeat(32), confirmation_requested: false }, 'create');
    assert.equal(again.ok, true, JSON.stringify(again)); assert.deepEqual(await counts(), pre);
  });

  await t('changed payload after a committed result under the same key: submission_mismatch, no duplicate', async () => {
    const pre = await counts();
    const changed = { submission_key: capturedKey, ...captured, notes: 'geändert' };
    const r = await multi({ ...changed, acknowledged_quote_digest: '0'.repeat(32), confirmation_requested: false }, 'create');
    assert.equal(r.error, 'submission_mismatch', JSON.stringify(r)); assert.deepEqual(await counts(), pre);
  });

  await t('saved-person cross-booking: earlier Anna lesson counts, earlier ticket unchanged', async () => {
    const { c: first } = await bookAck(solo('2026-12-22', '10:00', '12:00', `b07b-x1-${Date.now()}`));
    const firstTotal = n2((await sql`SELECT total_amount FROM tickets WHERE id=${first.ticket_id}`)[0].total_amount);
    const p = solo('2026-12-22', '14:00', '16:00', `b07b-x2-${Date.now()}`);
    const q = await multi(p, 'quote');
    assert.equal(q.quote.existing_same_day_appointments, 1);
    assert.equal(q.quote.private[0].discount_source, 'automatic'); assert.ok(n2(q.quote.private[0].net) < n2(q.quote.private[0].gross));
    const { c } = await bookAck(p);
    assert.ok(c.ticket_id !== first.ticket_id);
    assert.equal(n2((await sql`SELECT total_amount FROM tickets WHERE id=${first.ticket_id}`)[0].total_amount), firstTotal);
  });

  await t('stale quote: another booking changes Anna\'s day after the quote => quote_changed, nothing saved', async () => {
    const p = solo('2026-12-23', '14:00', '16:00', `b07b-s1-${Date.now()}`);
    const q = await multi(p, 'quote'); assert.equal(q.ok, true);
    await bookAck(solo('2026-12-23', '10:00', '12:00', `b07b-s2-${Date.now()}`));
    const pre = await counts();
    const r = await multi({ ...p, acknowledged_quote_digest: q.quote.quote_digest, confirmation_requested: false }, 'create');
    assert.equal(r.error, 'quote_changed', JSON.stringify(r)); assert.deepEqual(await counts(), pre);
    assert.ok(r.quote?.quote_digest && r.quote.quote_digest !== q.quote.quote_digest);
  });
  await t('rollback restores the 0004 guard (BC private activation blocked again) and drops B07b objects', async () => {
    await sql`UPDATE products SET is_active = false WHERE id = ${SB}`;
    const res = psqlFile('supabase/rollback/b07_private_activation_guard_rollback.sql'); assert.equal(res.status, 0, res.stderr);
    await assert.rejects(activate(SB), /pricing release gate/);
    assert.equal((await sql`SELECT to_regclass('public.private_tariff_required_coverage') r`)[0].r, null);
    assert.equal((await sql`SELECT is_active FROM products WHERE id=${SKI}`)[0].is_active, true);
  });
} finally {
  console.log(results.join('\n'));
  console.log(`\n${passed} passed, ${results.filter((r) => r.startsWith('FAIL')).length} failed`);
  await sql.end(); await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin.end();
}
