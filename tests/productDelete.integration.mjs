// Isolated local PostgreSQL only: production schema baseline + pending product_delete.sql + synthetic rows.
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const opts={host:'/tmp',port:55432,username:'postgres',ssl:false,onnotice:()=>{}};
const admin=postgres({...opts,database:'postgres'}),name=`product_delete_${Date.now()}`;
await admin.unsafe(`CREATE DATABASE ${name}`);
const sql=postgres({...opts,database:name});
const file=f=>{const r=spawnSync('psql',['-X','-h','/tmp','-p','55432','-U','postgres','-d',name,'-q','-v','ON_ERROR_STOP=1','-1','-f',f],{encoding:'utf8'});if(r.status)throw Error(r.stderr);};
const staff='00000000-0000-4000-8000-000000000001',teacher='00000000-0000-4000-8000-000000000009',season='00000000-0000-4000-8000-000000000002';
const P=n=>`00000000-0000-4000-8000-0000000001${String(n).padStart(2,'0')}`;
const del=(p,a=staff)=>sql`SELECT product_delete(${p}::uuid,${a}::uuid) r`.then(r=>r[0].r);
const count=async(t,p)=>Number((await sql.unsafe(`SELECT count(*) n FROM ${t} WHERE product_id=$1`,[p]))[0].n);
let passed=0;const test=async(n,f)=>{await f();console.log('PASS',n);passed++;};
try{
  file('tests/sql/baseline_prelude.sql');file('tests/sql/production_schema_baseline.sql');
  file('supabase/pending/product_public_offerings.sql');file('supabase/pending/public_private_tariff_display.sql');file('supabase/pending/product_delete.sql');
  await sql`INSERT INTO auth.users(id,email) VALUES(${staff},'s@invalid.test'),(${teacher},'t@invalid.test')`;
  await sql`INSERT INTO user_roles(user_id,role) VALUES(${staff},'office'),(${teacher},'teacher')`;
  await sql`INSERT INTO seasons(id,name,start_date,end_date) VALUES(${season},'Synthetic','2026-12-01','2027-04-15')`;
  for(const n of [1,2,3,4])await sql`INSERT INTO products(id,season_id,name,type,price,is_active) VALUES(${P(n)},${season},${'Fixture '+n},'group',70,false)`;
  await test('unauthorized actor cannot delete',async()=>{await assert.rejects(del(P(1),teacher),/forbidden/);assert.equal(Number((await sql`SELECT count(*) n FROM products WHERE id=${P(1)}`)[0].n),1);});
  await test('client roles cannot execute RPC',async()=>{const g=await sql`SELECT has_function_privilege('authenticated','public.product_delete(uuid,uuid)','EXECUTE') a,has_function_privilege('anon','public.product_delete(uuid,uuid)','EXECUTE') b`;assert.equal(g[0].a,false);assert.equal(g[0].b,false);});
  await test('unused product deleted; only own tiers and offering cascade',async()=>{
    await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES(${P(1)},1,70),(${P(1)},2,110),(${P(2)},1,70)`;
    await sql`INSERT INTO product_public_offerings(product_id,schedule_kind,weekdays,dates,time_blocks,updated_by) VALUES(${P(1)},'weekly',ARRAY[6]::smallint[],'{}','[{"start":"10:00","end":"12:00"}]',${staff})`;
    assert.deepEqual(await del(P(1)),{ok:true});
    assert.equal(Number((await sql`SELECT count(*) n FROM products WHERE id=${P(1)}`)[0].n),0);
    assert.equal(await count('product_price_tiers',P(1)),0);assert.equal(await count('product_public_offerings',P(1)),0);
    assert.equal(await count('product_price_tiers',P(2)),1);
  });
  await test('product with group course refused, course and tiers untouched',async()=>{
    await sql`INSERT INTO group_courses(name,product_id,min_age,max_age,price_per_day) VALUES('Synthetic course',${P(2)},16,99,70)`;
    const r=await del(P(2));assert.equal(r.error,'referenced');assert.equal(r.dependencies.group_courses,1);
    assert.equal(await count('group_courses',P(2)),1);assert.equal(await count('product_price_tiers',P(2)),1);
  });
  await test('imported BC draft product refused, BC source untouched',async()=>{
    await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload) VALUES('synthetic',${season},${P(3)},'x','Private','draft',1,60,1,75,'{}')`;
    const r=await del(P(3));assert.equal(r.error,'referenced');assert.equal(r.dependencies.bc_product_tariff_sources,1);assert.equal(await count('bc_product_tariff_sources',P(3)),1);
  });
  await test('pricing rule reference refused',async()=>{
    await sql`INSERT INTO pricing_rules(name,type,discount_type,discount_value,applies_to_products) VALUES('Synthetic','promo','percent',10,${[P(4)]}::uuid[])`;
    assert.equal((await del(P(4))).dependencies.pricing_rules,1);
  });
  await test('missing product reports not_found',async()=>{assert.equal((await del(P(50))).error,'not_found');});
  console.log(`${passed}/7 passed`);
}finally{await sql.end();await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}
