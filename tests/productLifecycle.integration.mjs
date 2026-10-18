// Isolated local PostgreSQL only; never production.
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const host=process.env.BC_TEST_PGSOCKET??'/tmp';assert.ok(host.startsWith('/tmp'));
const opts={host,port:55432,username:'postgres',ssl:false,onnotice:()=>{}};
const admin=postgres({...opts,database:'postgres'}),name=`lifecycle_${Date.now()}`;
await admin.unsafe(`CREATE DATABASE ${name}`);
const sql=postgres({...opts,database:name});
const actor='00000000-0000-4000-8000-000000000001',season='00000000-0000-4000-8000-000000000002';
const id='00000000-0000-4000-8000-000000000003';let passed=0;
const test=async(n,f)=>{await f();console.log('PASS',n);passed++;};
const file=f=>{const r=spawnSync('psql',['-X','-h',host,'-p','55432','-U','postgres','-d',name,'-q','-v','ON_ERROR_STOP=1','-1','-f',f],{encoding:'utf8'});if(r.status)throw Error(r.stderr);};
const row=async()=> (await sql`SELECT to_jsonb(p) r FROM products p WHERE id=${id}`)[0]?.r;
const act=(action,expected,patch={},a=actor)=>sql`SELECT product_lifecycle(${id}::uuid,${action},${sql.json(expected??null)}::jsonb,${sql.json(patch)}::jsonb,${a}::uuid) r`.then(r=>r[0].r);
try{
file('tests/sql/baseline_prelude.sql');file('tests/sql/production_schema_baseline.sql');file('supabase/pending/product_public_offerings.sql');file('supabase/pending/product_lifecycle.sql');
await sql`INSERT INTO auth.users(id,email) VALUES(${actor},'synthetic@invalid.test')`;
await sql`INSERT INTO user_roles(user_id,role) VALUES(${actor},'office')`;
await sql`GRANT SELECT,UPDATE ON products TO authenticated`;
await sql`INSERT INTO seasons(id,name,start_date,end_date) VALUES(${season},'Synthetic','2026-12-01','2027-04-15')`;
await sql`INSERT INTO products(id,season_id,name,type,price,is_active) VALUES(${id},${season},'Imported','private',75,false)`;
await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload) VALUES('synthetic',${season},${id},'synthetic','Private','draft',1,60,1,75,'{}')`;
const bcBefore=await sql`SELECT to_jsonb(t) r FROM bc_product_tariff_sources t`;
await test('imported activation/save/reload without BC, price or visibility changes',async()=>{const before=await row(),r=await act('update',before,{is_active:true});assert.equal(r.product.is_active,true);assert.equal(r.product.price,75);assert.equal(r.product.show_on_website,false);assert.deepEqual(await row(),r.product);assert.deepEqual(await sql`SELECT to_jsonb(t) r FROM bc_product_tariff_sources t`,bcBefore);assert.equal((await sql`SELECT count(*) n FROM product_price_tiers`)[0].n,'0');});
await test('stale product snapshot fails closed',async()=>{const before=await row();await sql`UPDATE products SET name='Concurrent' WHERE id=${id}`;assert.equal((await act('update',before,{is_active:false})).error,'conflict');assert.equal((await row()).is_active,true);});
await test('nonstaff and client execute/delete denied',async()=>{await assert.rejects(act('update',await row(),{is_active:false},season),/Forbidden/);for(const role of ['anon','authenticated']){const [r]=await sql`SELECT has_function_privilege(${role},'product_lifecycle(uuid,text,jsonb,jsonb,uuid)','EXECUTE') e,has_table_privilege(${role},'products','DELETE') d`;assert.equal(r.e,false);assert.equal(r.d,false);}await assert.rejects(sql.begin(async tx=>{await tx`SET LOCAL ROLE authenticated`;await tx`UPDATE products SET is_active=false WHERE id=${id}`;}),/staff product lifecycle/);});
await test('BC-reference delete blocked; deactivate retains related history',async()=>{const r=await act('delete',await row());assert.equal(r.error,'referenced');assert.equal(r.dependencies['bc_product_tariff_sources.product_id'],1);const a=await act('update',await row(),{is_active:false});assert.equal(a.product.is_active,false);assert.deepEqual(await sql`SELECT to_jsonb(t) r FROM bc_product_tariff_sources t`,bcBefore);});
await sql`DELETE FROM bc_product_tariff_sources WHERE product_id=${id}`;
await test('price tier cascade never permitted',async()=>{await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES(${id},1,70)`;assert.equal((await act('delete',await row())).dependencies['product_price_tiers.product_id'],1);assert.equal((await sql`SELECT cumulative_price FROM product_price_tiers WHERE product_id=${id}`)[0].cumulative_price,'70.00');await sql`DELETE FROM product_price_tiers WHERE product_id=${id}`;});
await test('non-FK arrays and JSON refs block deletion',async()=>{await sql`CREATE TABLE synthetic_refs(id uuid,product_ids uuid[],payload jsonb)`;await sql`INSERT INTO synthetic_refs VALUES(${season},ARRAY[${id}::uuid],${sql.json({product_id:id})})`;const deps=(await act('delete',await row())).dependencies;assert.equal(deps['synthetic_refs.product_ids'],1);assert.equal(deps['synthetic_refs.payload'],1);await sql`DROP TABLE synthetic_refs`;});
await test('unknown product reference type aborts without changes',async()=>{await sql`CREATE TABLE synthetic_unknown(product_key text)`;await assert.rejects(act('delete',await row()),/Unclassified/);assert.ok(await row());await sql`DROP TABLE synthetic_unknown`;});
await test('unused deletion and audit snapshot atomic',async()=>{const before=await row(),r=await act('delete',before);assert.equal(r.deleted,true);assert.equal(await row(),undefined);const [log]=await sql`SELECT * FROM product_lifecycle_log WHERE id=${r.log_id}`;assert.deepEqual(log.before_snapshot,before);assert.equal(log.actor,actor);assert.equal(log.action,'delete');});
await test('rollback only removes lifecycle structures',async()=>{file('supabase/rollback/product_lifecycle_rollback.sql');assert.equal((await sql`SELECT to_regclass('public.product_lifecycle_log') r`)[0].r,null);assert.equal((await sql`SELECT count(*) n FROM seasons WHERE id=${season}`)[0].n,'1');});
console.log(`${passed}/${passed} passed`);
}finally{await sql.end();await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();}