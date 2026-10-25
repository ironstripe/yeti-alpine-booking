// Real SQL tests: public standard private prices projected from the product tariff resolver (public channel).
// Throwaway local PostgreSQL from the production baseline; all amounts are fixture DATA (= PROPOSED seed rows).
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun ./tests/publicPrivateTariffProjection.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `pub_proj_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 2 });
const root = new URL('../', import.meta.url);
const psqlFile = (f, vars = []) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', ...vars.flatMap((v) => ['-v', v]), '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const S = 'f185b448-e6aa-46b8-94ae-0875a7a6c166';
const SKI = '3646f155-8a66-53e3-b512-749f3a42c1ae', SNOW = '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1';
const GROUP = '00000000-0000-4000-8000-0000000000a9', ACTOR = '00000000-0000-4000-8000-00000000beef';

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
const SIX = ['09:00-10:00', '12:00-13:00', '13:00-14:00', '10:00-12:00', '12:00-14:00', '14:00-16:00'];
const key = (w) => `${w.start}-${w.end}`;

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/pa_assign_later.sql',
    'supabase/pending/staff_booking_finalize.sql', 'supabase/pending/staff_guest_level.sql',
    'supabase/pending/public_private_tariff_display.sql']) {
    const res = psqlFile(f); if (res.status !== 0) throw new Error(`psql ${f}: ${res.stderr}`);
  }
  // Staged install: projection SQL refuses to install before the tariff resolver exists.
  const early = psqlFile('supabase/pending/public_private_tariff_projection.sql');
  const earlyRefused = early.status !== 0 && /Install .* first/.test(early.stderr);
  const res = psqlFile('supabase/pending/product_private_tariff_rules.sql'); if (res.status !== 0) throw new Error(res.stderr);
  const proj = psqlFile('supabase/pending/public_private_tariff_projection.sql'); if (proj.status !== 0) throw new Error(proj.stderr);

  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO user_roles(user_id,role) VALUES ('${ACTOR}','office');
    INSERT INTO seasons(id,name,start_date,end_date,is_current) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15',true);
    INSERT INTO products(id,name,type,discipline,duration_minutes,price,season_id,is_active,currency,pricing_type) VALUES
      ('${SKI}','Privat Ski','private','ski',55,75,'${S}',true,'CHF','fixed'),('${SNOW}','Privat Snowboard','private','snowboard',60,75,'${S}',true,'CHF','fixed'),
      ('${GROUP}','Gruppe','group','ski',240,300,'${S}',true,'CHF','fixed');
    INSERT INTO private_lesson_discount_rule(percent,threshold_minutes,provenance) VALUES (10,240,'fixture = PROPOSED seed');
  `);
  const save = async (p, expected, rules) => (await sql`SELECT save_product_private_tariff_rules(${p}::uuid, ${expected}::int, ${sql.json(rules)}::jsonb, ${ACTOR}::uuid) r`)[0].r;
  const project = async (p) => (await sql`SELECT public_private_tariff_projection(${p}::uuid, ${S}::uuid) r`)[0].r;
  const verify = async (p) => {
    const [{ rev }] = await sql`SELECT revision rev FROM public_private_tariff_display WHERE product_id=${p}`;
    const [{ i }] = await sql`SELECT to_jsonb(d) - '{product_id,season_id,base_persons,revision,updated_by,updated_at,verified_by,verified_at}'::text[] i FROM public_private_tariff_display d WHERE product_id=${p}`;
    await sql`SELECT save_public_private_tariff_display(${p}::uuid, ${S}::uuid, ${sql.json({ ...i, discount_percent: Number(i.discount_percent), source_date: String(i.source_date).slice(0, 10) })}::jsonb, ${rev}::int, true, ${ACTOR}::uuid)`;
  };

  await t('staged install: projection SQL refuses before the tariff resolver exists', async () => { assert.equal(earlyRefused, true, early.stderr); });

  await t('grants: projection service-only', async () => {
    for (const role of ['anon', 'authenticated']) assert.equal((await sql`SELECT has_function_privilege(${role}, 'public.public_private_tariff_projection(uuid,uuid)', 'EXECUTE') ok`)[0].ok, false);
    assert.equal((await sql`SELECT has_function_privilege('service_role', 'public.public_private_tariff_projection(uuid,uuid)', 'EXECUTE') ok`)[0].ok, true);
  });

  await t('no display row / tariffs not configured: fail closed (no zero, no default)', async () => {
    assert.equal((await project(SKI)).error, 'not_verified');
  });

  // PROPOSED window seed fails closed while tariffs are absent, then succeeds with resolver-derived values.
  await t('PROPOSED window seed refuses without configured tariffs; nothing saved', async () => {
    const s = psqlFile('supabase/pending/public_private_tariff_display_windows.PROPOSED.sql', [`staff_actor=${ACTOR}`]);
    assert.notEqual(s.status, 0); assert.match(s.stderr, /Tariff not configured/);
    assert.equal((await sql`SELECT count(*)::int n FROM public_private_tariff_display`)[0].n, 0);
  });

  await save(SKI, 0, MALBUN); await save(SNOW, 0, MALBUN);

  await t('seed writes six standard windows, unverified; projection hidden until Office verifies', async () => {
    const s = psqlFile('supabase/pending/public_private_tariff_display_windows.PROPOSED.sql', [`staff_actor=${ACTOR}`]);
    assert.equal(s.status, 0, s.stderr);
    const [d] = await sql`SELECT windows, verified_at, discount_threshold, discount_unit FROM public_private_tariff_display WHERE product_id=${SKI}`;
    assert.deepEqual(d.windows.map(key), SIX); assert.equal(d.verified_at, null);
    assert.deepEqual([d.discount_threshold, d.discount_unit], [240, 'minutes']);
    assert.equal((await project(SKI)).error, 'not_verified');
    await verify(SKI); await verify(SNOW);
  });

  await t('six standard windows: gross 75/75/75/190/150/190, extras 20/20/20/40/40/40; discount 10%/240 min from rule', async () => {
    const p = await project(SKI);
    assert.equal(p.ok, true, JSON.stringify(p));
    const byKey = Object.fromEntries(p.windows.map((w) => [key(w), w]));
    assert.deepEqual(SIX.map((k) => Number(byKey[k].amount_chf)), [75, 75, 75, 190, 150, 190]);
    assert.deepEqual(SIX.map((k) => Number(byKey[k].extra_person_chf)), [20, 20, 20, 40, 40, 40]);
    assert.equal(p.windows.length, 6); assert.ok(p.windows.every((w) => w.classification === 'standard' && w.window_kind === 'exact'));
    assert.deepEqual({ ...p.discount, percent: Number(p.discount.percent) }, { percent: 10, threshold: 240, unit: 'minutes', scope: 'same_participant_same_day' });
  });

  await t('office exceptions stay operational but are absent publicly (09-11/13-15 = 160, 85 single in rush)', async () => {
    const p = await project(SKI);
    assert.ok(!p.windows.some((w) => ['09:00-11:00', '13:00-15:00'].includes(key(w)) || (w.duration_minutes === 60 && ['10:00', '14:00'].includes(w.start))));
    const office = async (s, e) => (await sql`SELECT pa_product_quote(${SKI}::uuid, '2026-12-14'::date, ${s}::time, ${e}::time, 1, true) r`)[0].r;
    assert.equal(Number((await office('09:00', '11:00')).price), 160); assert.equal(Number((await office('13:00', '15:00')).price), 160);
    assert.equal(Number((await office('10:00', '11:00')).price), 85); assert.equal(Number((await office('15:00', '16:00')).price), 85);
  });

  await t('quoted gross for a booking equals the public amount (same resolver)', async () => {
    const p = await project(SKI);
    for (const w of p.windows) {
      const q = (await sql`SELECT pa_create_quote(${sql.json({ product_id: SKI, persons: 1, appointments: [{ date: '2026-12-14', time_start: w.start, time_end: w.end }] })}::jsonb) r`)[0].r;
      assert.equal(Number(q.gross_total), Number(w.amount_chf), key(w));
      const q2 = (await sql`SELECT pa_create_quote(${sql.json({ product_id: SKI, persons: 2, appointments: [{ date: '2026-12-14', time_start: w.start, time_end: w.end }] })}::jsonb) r`)[0].r;
      assert.equal(Number(q2.gross_total) - Number(q.gross_total), Number(w.extra_person_chf), key(w));
    }
  });

  await t('editing product config changes public amount without code edit; other product unchanged', async () => {
    await save(SNOW, 1, MALBUN.map((x) => (x.rule_kind === 'exact_block' && x.window_start === '10:00' ? { ...x, price_chf: 200, extra_person_chf: 45 } : x)));
    const w = (await project(SNOW)).windows.find((x) => key(x) === '10:00-12:00');
    assert.deepEqual([Number(w.amount_chf), Number(w.extra_person_chf)], [200, 45]);
    assert.equal(Number((await project(SKI)).windows.find((x) => key(x) === '10:00-12:00').amount_chf), 190);
    await sql`UPDATE private_lesson_discount_rule SET percent = 12, provenance = 'fixture change'`;
    assert.equal(Number((await project(SKI)).discount.percent), 12);
    await sql`UPDATE private_lesson_discount_rule SET percent = 10, provenance = 'fixture = PROPOSED seed'`;
  });

  await t('stored legacy display amounts are never used', async () => {
    await sql`ALTER TABLE public_private_tariff_display DISABLE TRIGGER USER`;
    await sql`UPDATE public_private_tariff_display SET windows = (SELECT jsonb_agg(x || '{"amount_chf":999}') FROM jsonb_array_elements(windows) x), discount_threshold = 4, discount_unit = 'lessons' WHERE product_id = ${SKI}`;
    const p = await project(SKI);
    assert.ok(p.windows.every((w) => Number(w.amount_chf) !== 999)); assert.equal(p.discount.threshold, 240);
  });

  await t('display listing an office exception as standard => whole product fails closed (no expansion, no partial list)', async () => {
    await sql`UPDATE public_private_tariff_display SET windows = windows || '[{"start":"09:00","end":"11:00","duration_minutes":120,"amount_chf":160,"extra_person_chf":40,"classification":"standard","window_kind":"exact"}]' WHERE product_id = ${SKI}`;
    const p = await project(SKI); assert.equal(p.error, 'tariff_unavailable'); assert.equal(p.reason, 'office_only');
  });

  await t('missing/invalid config fails closed: no tariff rules, gap window, missing discount rule, group product', async () => {
    await sql`UPDATE public_private_tariff_display SET windows = windows || '[{"start":"16:00","end":"17:00","duration_minutes":60,"amount_chf":75,"extra_person_chf":20,"classification":"standard","window_kind":"exact"}]' WHERE product_id = ${SNOW}`;
    assert.equal((await project(SNOW)).reason, 'no_rule');
    await sql`DELETE FROM product_private_tariff_rules WHERE product_id = ${SNOW}`;
    assert.equal((await project(SNOW)).reason, 'not_configured');
    await sql`DELETE FROM private_lesson_discount_rule`;
    assert.equal((await project(SNOW)).reason, 'discount_rule_not_configured');
    assert.equal((await project(GROUP)).error, 'not_verified');
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}
