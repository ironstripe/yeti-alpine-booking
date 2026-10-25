// Tariff correction 2026-10-25: 14-16 = CHF 170 via canonical save (rev 1 -> 2). Local only.
// Fixtures mirror the live before-state (rules rev 1, display rev 1).
//   node tests/privateTariff1416Correction.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `tr170_${Date.now()}`;
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

const S = 'f185b448-e6aa-46b8-94ae-0875a7a6c166', SKI = '3646f155-8a66-53e3-b512-749f3a42c1ae', SNOW = '0e8e8669-d8f4-5b19-8e6d-36ff588fdee1';
const GROUP = '00000000-0000-4000-8000-0000000000a9', ACTOR = '00000000-0000-4000-8000-00000000beef', TEACHER = '00000000-0000-4000-8000-00000000cafe';
const r = (o) => ({ max_persons: 4, max_block_minutes: null, office_only: false, provenance: 'fixture = live rev 1', ...o });
const LIVE_RULES = [
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
  const files = ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql',
    ...readdirSync(new URL('drizzle/migrations/', root)).filter((n) => /^\d{4}_.*\.sql$/.test(n) && Number(n.slice(0, 4)) <= 27).sort().map((n) => `drizzle/migrations/${n}`),
    'supabase/pending/r1_pa_move_keep_unassigned.sql', 'supabase/pending/r1_group_created_total_event.sql', 'supabase/pending/r1_invoice_content_snapshot.sql',
    'supabase/pending/public_private_tariff_projection.sql'];
  for (const f of files) { const res = psqlFile(f); if (res.status !== 0) throw new Error(`psql ${f}: ${res.stderr}`); }

  // Rollback literal must equal the live before-image hash.
  const rb = (await import('node:fs')).readFileSync(new URL('supabase/rollback/public_private_prices_r1_display_update_rollback.sql', root), 'utf8');
  const OLD = JSON.parse(rb.match(/\$old\$(.*)\$old\$/s)[1]);

  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid'),('${TEACHER}','teacher@example.invalid');
    INSERT INTO user_roles(user_id,role) VALUES ('${ACTOR}','office'),('${TEACHER}','teacher');
    INSERT INTO seasons(id,name,start_date,end_date,is_current) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15',true);
    INSERT INTO products(id,name,type,discipline,duration_minutes,price,season_id,is_active,show_on_website,currency,pricing_type) VALUES
      ('${SKI}','Privat Ski','private','ski',55,75,'${S}',false,true,'CHF','fixed'),('${SNOW}','Privat Snowboard','private','snowboard',60,75,'${S}',false,true,'CHF','fixed'),
      ('${GROUP}','Gruppe','group','ski',240,300,'${S}',true,true,'CHF','fixed');
    INSERT INTO private_lesson_discount_rule(percent,threshold_minutes,provenance) VALUES (10,240,'fixture = live rev 1');
  `);
  const save = async (p, expected, rules) => (await sql`SELECT save_product_private_tariff_rules(${p}::uuid, ${expected}::int, ${sql.json(rules)}::jsonb, ${ACTOR}::uuid) r`)[0].r;
  await save(SKI, 0, LIVE_RULES); await save(SNOW, 0, LIVE_RULES);
  for (const p of [SKI, SNOW]) await sql`SELECT save_public_private_tariff_display(${p}::uuid, ${S}::uuid, ${sql.json({ ...OLD, source_note: 'Ivo 2026-10-18 public website information approved.' })}::jsonb, NULL, true, ${ACTOR}::uuid)`;
  const project = async (p) => (await sql`SELECT public_private_tariff_projection(${p}::uuid, ${S}::uuid) r`)[0].r;
  const run = (f, vars = []) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', ...vars.flatMap((v) => ['-v', v]), '-f', fileURLToPath(new URL(f, root))],
    { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });
  const quote = async (p, s, e, n = 1) => (await sql`SELECT pa_product_quote(${p}::uuid, '2026-12-14'::date, ${s}::time, ${e}::time, ${n}::int, false) r`)[0].r;
  const rev = async (p) => (await sql`SELECT revision FROM product_private_tariff_revisions WHERE product_id=${p}`)[0].revision;
  const ids1416 = async () => (await sql`SELECT product_id, id FROM product_private_tariff_rules WHERE rule_kind='exact_block' AND window_start='14:00' ORDER BY product_id`);
  // Stand-in for stored historical pricing: must be untouched.
  await sql`CREATE TABLE hist_probe AS SELECT 190::numeric AS price, 'pre-change 14-16' AS note`;
  const before = { ski: await quote(SKI, '14:00', '16:00'), ids: await ids1416() };

  await t('before: rev 1, 14-16 quotes 190 (pre-change historical expectation)', async () => {
    assert.equal(await rev(SKI), 1); assert.equal(Number(before.ski.price), 190);
  });
  await t('installer refuses a changed before-image and saves nothing', async () => {
    await sql`UPDATE product_private_tariff_rules SET price_chf = 191 WHERE product_id=${SNOW} AND rule_kind='exact_block' AND window_start='14:00'`;
    const s = run('supabase/pending/private_tariff_1416_170_correction.sql');
    assert.notEqual(s.status, 0); assert.match(s.stderr, /differ from the reviewed revision 1/);
    assert.equal(await rev(SKI), 1); assert.equal(Number((await quote(SKI, '14:00', '16:00')).price), 190);
    await sql`UPDATE product_private_tariff_rules SET price_chf = 190 WHERE product_id=${SNOW} AND rule_kind='exact_block' AND window_start='14:00'`;
  });
  const dispBefore = await sql`SELECT md5(to_jsonb(d)::text) h FROM public_private_tariff_display d ORDER BY product_id`;
  const discBefore = await sql`SELECT md5(to_jsonb(d)::text) h FROM private_lesson_discount_rule d`;
  const prodBefore = await sql`SELECT md5(to_jsonb(p)::text) h FROM products p ORDER BY id`;
  await t('installer: both products rev 2, 14-16 = 170, all other windows unchanged, extras unchanged', async () => {
    const s = run('supabase/pending/private_tariff_1416_170_correction.sql'); assert.equal(s.status, 0, s.stderr);
    for (const p of [SKI, SNOW]) {
      assert.equal(await rev(p), 2);
      const exp = { '14:00-16:00': 170, '10:00-12:00': 190, '12:00-14:00': 150, '09:00-10:00': 75, '12:00-13:00': 75, '13:00-14:00': 75 };
      for (const [w, v] of Object.entries(exp)) { const [a, b] = w.split('-'); assert.equal(Number((await quote(p, a, b)).price), v, `${p} ${w}`); }
      assert.equal(Number((await quote(p, '14:00', '16:00', 2)).price), 210);
      assert.equal(Number((await quote(p, '10:00', '12:00', 2)).price), 230);
      assert.equal((await sql`SELECT count(*)::int n FROM product_private_tariff_rules WHERE product_id=${p}`)[0].n, 9);
    }
  });
  await t('rule IDs of the 14-16 rule change (replace-save), recorded for review', async () => {
    const after = await ids1416(); assert.notDeepEqual(after.map((x) => x.id), before.ids.map((x) => x.id));
  });
  await t('display metadata, discount rule, products unchanged; no historical rows touched', async () => {
    assert.deepEqual(await sql`SELECT md5(to_jsonb(d)::text) h FROM public_private_tariff_display d ORDER BY product_id`, dispBefore);
    assert.deepEqual(await sql`SELECT md5(to_jsonb(d)::text) h FROM private_lesson_discount_rule d`, discBefore);
    assert.deepEqual(await sql`SELECT md5(to_jsonb(p)::text) h FROM products p ORDER BY id`, prodBefore);
    assert.equal(Number((await sql`SELECT price FROM hist_probe`)[0].price), 190);
    assert.equal((await sql`SELECT count(*)::int n FROM private_appointment_pricing`)[0].n, 0);
  });
  await t('stale rev-1 acknowledgement is rejected with quote_changed (existing semantics)', async () => {
    const res = (await sql`SELECT pa_create_booking(${sql.json({ submission_key: 'tr170-stale', product_id: SKI, quote_revision: 1, discount_rule_revision: 1, day_context_digest: 'x' })}::jsonb, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(res.error, 'quote_changed', JSON.stringify(res)); assert.equal(res.quote.revision, 2);
  });
  await t('installer is not re-runnable (revision now 2)', async () => {
    const s = run('supabase/pending/private_tariff_1416_170_correction.sql'); assert.notEqual(s.status, 0); assert.match(s.stderr, /is not 1/);
  });
  await t('public projection (six windows) derives 170 for 14-16 from the same resolver', async () => {
    const s = psqlFile('supabase/pending/public_private_prices_r1_display_update.sql', [`staff_actor=${ACTOR}`, 'verify=true']); assert.equal(s.status, 0, s.stderr);
    for (const p of [SKI, SNOW]) {
      const pr = await project(p); assert.ok(!pr.error, JSON.stringify(pr));
      const prices = Object.fromEntries(pr.windows.map((w) => [key(w), Number(w.price_chf ?? w.price)]));
      assert.deepEqual(Object.keys(prices).sort(), [...SIX].sort());
      assert.equal(prices['14:00-16:00'], 170); assert.equal(prices['10:00-12:00'], 190); assert.equal(prices['12:00-14:00'], 150);
    }
  });
  await t('rollback restores 190 via canonical save (rev 3)', async () => {
    const s = run('supabase/rollback/private_tariff_1416_170_correction_rollback.sql', ['expected_revision=2']); assert.equal(s.status, 0, s.stderr);
    assert.equal(await rev(SKI), 3); assert.equal(Number((await quote(SNOW, '14:00', '16:00')).price), 190);
  });
} finally {
  await sql.end(); await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}
