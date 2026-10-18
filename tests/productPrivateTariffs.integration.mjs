// Real SQL tests for supabase/pending/product_private_tariffs.sql:
// atomic save of the editable private tariff matrix, validation, idempotency,
// and immutability of the Booking-Corner originals.
// Throwaway local PostgreSQL only: schema-only production baseline + pending SQL + synthetic data.
//   PGHOST=/tmp bun tests/productPrivateTariffs.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const socketDir = process.env.PGHOST ?? '/tmp';
const adminUrl = `postgres://postgres@localhost:55432/postgres?host=${socketDir}`;
const opts = { onnotice: () => {}, ssl: false };
const dbName = `private_tariffs_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
const dbUrl = `postgres://postgres@localhost:55432/${dbName}?host=${socketDir}`;
const sql = postgres(dbUrl, { ...opts, max: 10 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => {
  const r = spawnSync('psql', ['-h', socketDir, '-p', '55432', '-U', 'postgres', '-d', dbName, '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
};

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SEASON = id(1), PRIV = id(2), GROUP = id(3), ACTOR = id(0xbeef);

psqlFile('tests/sql/baseline_prelude.sql');
psqlFile('tests/sql/production_schema_baseline.sql');
psqlFile('supabase/pending/product_private_tariffs.sql');

await sql`INSERT INTO seasons (id, name, start_date, end_date, is_current)
  VALUES (${SEASON}, 'Winter 26/27', '2026-12-01', '2027-04-15', true)`;
await sql`INSERT INTO products (id, season_id, name, type, pricing_type, price, is_active)
  VALUES (${PRIV}, ${SEASON}, 'Privat Ski TEST', 'private', 'fixed', 0, false),
         (${GROUP}, ${SEASON}, 'Gruppenkurs TEST', 'group', 'tiered', 0, false)`;
// Immutable BC originals for the private product (2h x 3 persons = 200, 1h x 1 = 85)
await sql`INSERT INTO bc_product_tariff_sources
  (source_id, season_id, product_id, source_sha256, source_family, import_status, day_count, duration_minutes, persons_per_lesson, price_chf, source_payload)
  VALUES ('SRC-1', ${SEASON}, ${PRIV}, 'x', 'Privat', 'draft', 1, 60, 1, 85, '{}'),
         ('SRC-2', ${SEASON}, ${PRIV}, 'x', 'Privat', 'draft', 1, 120, 3, 200, '{}')`;

const save = (product, cells) =>
  sql`SELECT public.save_product_private_tariffs(${product}::uuid, ${sql.json(cells)}::jsonb, ${ACTOR}::uuid) r`.then((x) => x[0].r);

await t('save 2h/3persons and read back persisted matrix', async () => {
  const r = await save(PRIV, [{ duration_minutes: 120, persons_per_lesson: 3, price_chf: 210 }]);
  assert.equal(r.length, 1);
  assert.equal(Number(r[0].price_chf), 210);
  const rows = await sql`SELECT duration_minutes, persons_per_lesson, price_chf FROM product_private_tariffs WHERE product_id=${PRIV}`;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].price_chf), 210);
});

await t('second save updates the same cell and adds another (no duplicates)', async () => {
  await save(PRIV, [
    { duration_minutes: 120, persons_per_lesson: 3, price_chf: 215 },
    { duration_minutes: 60, persons_per_lesson: 1, price_chf: 90 },
  ]);
  const rows = await sql`SELECT count(*)::int c FROM product_private_tariffs WHERE product_id=${PRIV}`;
  assert.equal(rows[0].c, 2);
  const cell = await sql`SELECT price_chf FROM product_private_tariffs WHERE product_id=${PRIV} AND duration_minutes=120 AND persons_per_lesson=3`;
  assert.equal(Number(cell[0].price_chf), 215);
});

await t('idempotent replay of the same payload leaves the matrix unchanged', async () => {
  const before = await sql`SELECT price_chf, updated_at FROM product_private_tariffs WHERE product_id=${PRIV} ORDER BY 1`;
  await save(PRIV, [
    { duration_minutes: 120, persons_per_lesson: 3, price_chf: 215 },
    { duration_minutes: 60, persons_per_lesson: 1, price_chf: 90 },
  ]);
  const after = await sql`SELECT price_chf FROM product_private_tariffs WHERE product_id=${PRIV} ORDER BY 1`;
  assert.deepEqual(after.map((r) => Number(r.price_chf)), before.map((r) => Number(r.price_chf)));
});

await t('null price removes a cell', async () => {
  await save(PRIV, [{ duration_minutes: 60, persons_per_lesson: 1, price_chf: null }]);
  const rows = await sql`SELECT count(*)::int c FROM product_private_tariffs WHERE product_id=${PRIV}`;
  assert.equal(rows[0].c, 1);
});

await t('invalid cell rejects the whole call (no partial write)', async () => {
  await assert.rejects(
    save(PRIV, [
      { duration_minutes: 180, persons_per_lesson: 2, price_chf: 260 },
      { duration_minutes: 90, persons_per_lesson: 1, price_chf: 100 },
    ]),
    /outside allowed tariff range/,
  );
  const rows = await sql`SELECT count(*)::int c FROM product_private_tariffs WHERE product_id=${PRIV}`;
  assert.equal(rows[0].c, 1);
});

await t('zero/negative price rejected', async () => {
  await assert.rejects(save(PRIV, [{ duration_minutes: 60, persons_per_lesson: 1, price_chf: 0 }]), /positive/);
});

await t('duplicate cell in one payload rejected', async () => {
  await assert.rejects(save(PRIV, [
    { duration_minutes: 60, persons_per_lesson: 1, price_chf: 90 },
    { duration_minutes: 60, persons_per_lesson: 1, price_chf: 95 },
  ]), /Duplicate/);
});

await t('non-private product rejected', async () => {
  await assert.rejects(save(GROUP, [{ duration_minutes: 60, persons_per_lesson: 1, price_chf: 90 }]), /private/);
});

await t('unknown product rejected', async () => {
  await assert.rejects(save(id(0x999), [{ duration_minutes: 60, persons_per_lesson: 1, price_chf: 90 }]), /not found/i);
});

await t('BC originals unchanged after all saves', async () => {
  const rows = await sql`SELECT source_id, price_chf FROM bc_product_tariff_sources WHERE product_id=${PRIV} ORDER BY source_id`;
  assert.equal(rows.length, 2);
  assert.equal(Number(rows[0].price_chf), 85);
  assert.equal(Number(rows[1].price_chf), 200);
});

await t('authenticated role cannot execute the save function directly', async () => {
  const perms = await sql`SELECT has_function_privilege('authenticated', 'public.save_product_private_tariffs(uuid,jsonb,uuid)', 'EXECUTE') a,
    has_function_privilege('anon', 'public.save_product_private_tariffs(uuid,jsonb,uuid)', 'EXECUTE') b,
    has_function_privilege('service_role', 'public.save_product_private_tariffs(uuid,jsonb,uuid)', 'EXECUTE') c`;
  assert.equal(perms[0].a, false);
  assert.equal(perms[0].b, false);
  assert.equal(perms[0].c, true);
});

await t('table grants: authenticated SELECT only, service_role ALL', async () => {
  const perms = await sql`SELECT has_table_privilege('authenticated', 'public.product_private_tariffs', 'SELECT') s,
    has_table_privilege('authenticated', 'public.product_private_tariffs', 'INSERT') i,
    has_table_privilege('service_role', 'public.product_private_tariffs', 'INSERT') si`;
  assert.equal(perms[0].s, true);
  assert.equal(perms[0].i, false);
  assert.equal(perms[0].si, true);
});

console.log(results.join('\n'));
console.log(`${passed}/${results.length} passed`);
await sql.end(); await admin.unsafe(`DROP DATABASE ${dbName}`); await admin.end();
if (passed !== results.length) process.exit(1);
