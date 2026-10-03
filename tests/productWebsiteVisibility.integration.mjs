import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261003091500_product_website_visibility.sql', import.meta.url), 'utf8');
const publicApi = fs.readFileSync(new URL('../supabase/functions/get-website-products/index.ts', import.meta.url), 'utf8');
const current = '11111111-1111-4111-8111-111111111111';
const previous = '22222222-2222-4222-8222-222222222222';

async function fixture(count = 17) {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.seasons (id uuid PRIMARY KEY, name text NOT NULL, is_current boolean NOT NULL);
    CREATE TABLE public.products (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      season_id uuid NOT NULL REFERENCES public.seasons(id),
      type text NOT NULL, is_active boolean NOT NULL DEFAULT false,
      website_online_bookable boolean NOT NULL DEFAULT false
    );
    INSERT INTO public.seasons VALUES ('${current}', 'Winter 26/27', true), ('${previous}', 'Winter 25/26', false);
    INSERT INTO public.products (season_id, type)
      SELECT '${current}', 'group' FROM generate_series(1, ${count});
    INSERT INTO public.products (season_id, type) VALUES ('${current}', 'office_shift'), ('${previous}', 'group');
  `);
  return db;
}

const db = await fixture();
await db.exec(migration);
let result = await db.query(`SELECT
  count(*) FILTER (WHERE show_on_website) AS visible,
  count(*) FILTER (WHERE show_on_website AND season_id='${current}' AND type<>'office_shift') AS expected,
  count(*) FILTER (WHERE is_active OR website_online_bookable) AS activated
FROM public.products`);
assert.deepEqual(result.rows[0], { visible: 17, expected: 17, activated: 0 });
await db.exec(`INSERT INTO public.products (season_id,type) VALUES ('${current}', 'group')`);
result = await db.query('SELECT show_on_website FROM public.products ORDER BY id DESC LIMIT 1');
assert.equal(result.rows[0].show_on_website, false);
await db.exec(`UPDATE public.products SET show_on_website = false WHERE id = 1`);
result = await db.query(`SELECT count(*) AS visible FROM public.products WHERE show_on_website`);
assert.equal(result.rows[0].visible, 16);
await assert.rejects(db.exec(migration), /already migrated/);
await db.close();

const drift = await fixture(16);
await assert.rejects(drift.exec(migration), /Published 17-product baseline changed/);
await drift.exec('ROLLBACK');
result = await drift.query(`SELECT count(*) AS columns FROM information_schema.columns
  WHERE table_name='products' AND column_name='show_on_website'`);
assert.equal(result.rows[0].columns, 0);
await drift.close();

assert.match(publicApi, /\.eq\("season_id", season\.id\)\.eq\("show_on_website", true\)/);
assert.match(publicApi, /online_bookable:\s*false/);
assert.doesNotMatch(migration, /SET\s+(?:is_active|website_online_bookable)\s*=/i);
console.log('PASS product website visibility: 17 retained, future hidden, changeable, drift fails closed, booking unchanged');
