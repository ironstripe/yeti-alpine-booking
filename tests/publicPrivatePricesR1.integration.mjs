// Public private prices R1: projection + six-window data step on the combined chain (0000-0027 + R1 pending),
// fixtures mirror the live before-state (rules rev 1, display rev 1 with 11 windows). Local only.
//   node tests/publicPrivatePricesR1.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `pp_r1_${Date.now()}`;
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
  const row = async (p) => (await sql`SELECT revision, verified_at, updated_by, verified_by, md5(windows::text) h, windows, discount_unit, discount_threshold FROM public_private_tariff_display WHERE product_id=${p}`)[0];

  await t('rollback literal reproduces the live before-image hash 5f6ce3cf…', async () => {
    assert.equal((await row(SKI)).h, '5f6ce3cfba2f2a2615a5fc00d79b31a6');
  });
  await t('today (old 11-window list): projection fails closed office_only = no public private prices', async () => {
    const p = await project(SKI); assert.equal(p.error, 'tariff_unavailable'); assert.equal(p.reason, 'office_only');
  });
  await t('projection is service-only', async () => {
    for (const role of ['anon', 'authenticated']) assert.equal((await sql`SELECT has_function_privilege(${role}, 'public.public_private_tariff_projection(uuid,uuid)', 'EXECUTE') ok`)[0].ok, false);
  });
  await t('data step refuses non-staff actor and changes nothing', async () => {
    const s = psqlFile('supabase/pending/public_private_prices_r1_display_update.sql', [`staff_actor=${TEACHER}`, 'verify=true']);
    assert.notEqual(s.status, 0); assert.match(s.stderr, /Verified staff actor required/);
    assert.equal((await row(SKI)).revision, 1);
  });
  await t('data step refuses a changed before-image (revision check), nothing saved', async () => {
    await sql`UPDATE public_private_tariff_display SET revision = 7 WHERE product_id=${SNOW}`;
    const s = psqlFile('supabase/pending/public_private_prices_r1_display_update.sql', [`staff_actor=${ACTOR}`, 'verify=true']);
    assert.notEqual(s.status, 0); assert.match(s.stderr, /before-image/);
    assert.equal((await row(SKI)).revision, 1);
    await sql`UPDATE public_private_tariff_display SET revision = 1 WHERE product_id=${SNOW}`;
  });
  const prodBefore = await sql`SELECT md5(to_jsonb(p)::text) h FROM products p ORDER BY id`;
  await t('verify=false: six windows saved rev 2 unverified; still not public', async () => {
    const s = psqlFile('supabase/pending/public_private_prices_r1_display_update.sql', [`staff_actor=${ACTOR}`, 'verify=false']);
    assert.equal(s.status, 0, s.stderr); assert.match(s.stderr, /before-image/);
    const d = await row(SKI);
    assert.deepEqual([d.revision, d.verified_at, d.updated_by], [2, null, ACTOR]); assert.deepEqual(d.windows.map(key), SIX);
    assert.deepEqual([d.discount_unit, d.discount_threshold], ['minutes', 240]);
    assert.equal((await project(SKI)).error, 'not_verified');
  });
  await t('verify=true path (fresh DB state rev1): six windows, verified by the same actor, projection ok', async () => {
    for (const p of [SKI, SNOW]) await sql`UPDATE public_private_tariff_display SET revision = 1, windows = ${sql.json(OLD.windows)}::jsonb WHERE product_id=${p}`;
    await sql`UPDATE public_private_tariff_display SET source_date = '2026-10-18'`;
    const s = psqlFile('supabase/pending/public_private_prices_r1_display_update.sql', [`staff_actor=${ACTOR}`, 'verify=true']);
    assert.equal(s.status, 0, s.stderr);
    for (const p of [SKI, SNOW]) { const d = await row(p); assert.deepEqual([d.revision, d.verified_by], [2, ACTOR]); }
  });
  await t('public = exactly six; 75/75/75/190/150/190, extras 20/20/20/40/40/40; no 85/160; both sports', async () => {
    for (const p of [SKI, SNOW]) {
      const pr = await project(p); assert.equal(pr.ok, true, JSON.stringify(pr));
      assert.equal(pr.windows.length, 6);
      const by = Object.fromEntries(pr.windows.map((w) => [key(w), w]));
      assert.deepEqual(SIX.map((k) => Number(by[k].amount_chf)), [75, 75, 75, 190, 150, 190]);
      assert.deepEqual(SIX.map((k) => Number(by[k].extra_person_chf)), [20, 20, 20, 40, 40, 40]);
      assert.ok(!pr.windows.some((w) => [85, 160].includes(Number(w.amount_chf))));
      assert.deepEqual({ ...pr.discount, percent: Number(pr.discount.percent) }, { percent: 10, threshold: 240, unit: 'minutes', scope: 'same_participant_same_day' });
    }
  });
  await t('server quote parity: pa_create_quote gross 1 and 2 persons = public amount/extra', async () => {
    for (const p of [SKI, SNOW]) for (const w of (await project(p)).windows) for (const n of [1, 2]) {
      const q = (await sql`SELECT pa_product_quote(${p}::uuid, '2026-12-14'::date, ${w.start}::time, ${w.end}::time, ${n}::int, false) r`)[0].r;
      assert.equal(Number(q.price), Number(w.amount_chf) + (n - 1) * Number(w.extra_person_chf), `${p} ${key(w)} ${n}`);
    }
  });
  await t('products and group untouched by data step', async () => {
    assert.deepEqual(await sql`SELECT md5(to_jsonb(p)::text) h FROM products p ORDER BY id`, prodBefore);
    assert.equal((await project(GROUP)).error, 'not_verified');
  });
  await t('changed tariff config is reflected without code or metadata change', async () => {
    const [{ rev }] = await sql`SELECT revision rev FROM product_private_tariff_revisions WHERE product_id=${SNOW}`;
    await save(SNOW, rev, LIVE_RULES.map((x) => (x.rule_kind === 'exact_block' && x.window_start === '14:00' ? { ...x, price_chf: 200 } : x)));
    assert.equal(Number((await project(SNOW)).windows.find((w) => key(w) === '14:00-16:00').amount_chf), 200);
    assert.equal(Number((await project(SKI)).windows.find((w) => key(w) === '14:00-16:00').amount_chf), 190);
  });
  await t('rollback script restores the old list via the save path (new revision)', async () => {
    const [{ revision }] = await sql`SELECT revision FROM public_private_tariff_display WHERE product_id=${SKI}`;
    await sql`UPDATE public_private_tariff_display SET revision = ${revision} WHERE product_id=${SNOW}`;
    const s = psqlFile('supabase/rollback/public_private_prices_r1_display_update_rollback.sql', [`staff_actor=${ACTOR}`, `expected_revision=${revision}`]);
    assert.equal(s.status, 0, s.stderr);
    const d = await row(SKI); assert.equal(d.h, '5f6ce3cfba2f2a2615a5fc00d79b31a6'); assert.equal(d.revision, revision + 1);
    assert.equal((await project(SKI)).reason, 'office_only');
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}
