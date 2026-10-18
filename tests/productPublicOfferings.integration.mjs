// Disposable local actual-schema PostgreSQL only; never reads project PG environment.
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const conn={host:'/tmp',port:55432,username:'postgres',ssl:false,onnotice:()=>{},max:1};
const name=`public_offering_${Date.now()}`;
const admin=postgres({...conn,database:'postgres'});
let db; let pass=0;let fail=0;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const S=id(1),P=id(2),F=id(3),O=id(4),T=id(5),A=id(6),SA=id(7);
const psql=(file,transaction=true)=>{const r=spawnSync('psql',['-h','/tmp','-p','55432','-U','postgres','-d',name,'-q','-v','ON_ERROR_STOP=1',...(transaction?['-1']:[]),'-f',fileURLToPath(new URL('../'+file,import.meta.url))],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
const run=async(label,fn)=>{try{await fn();console.log('PASS',label);pass++;}catch(e){console.log('FAIL',label,e.message);fail++;}};
const one={schedule_kind:'weekly',weekdays:[1,2,3,4,5],dates:[],time_blocks:[{start:'10:00',end:'12:00'}]};
const save=(product,offering,actor=O)=>db`SELECT public.save_product_public_offering(${product}::uuid,${db.json(offering)}::jsonb,${actor}::uuid) r`.then(rows=>rows[0].r);
const history=async()=>{const result={};for(const t of ['products','product_price_tiers','bc_product_tariff_sources','group_courses','tickets','ticket_items','private_appointments','invoices','payments'])result[t]=await db.unsafe(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) rows FROM public.${t} t`);return result;};
try {
  await admin.unsafe(`CREATE DATABASE ${name}`);db=postgres({...conn,database:name});
  psql('tests/sql/baseline_prelude.sql');psql('tests/sql/production_schema_baseline.sql');
  await db`INSERT INTO auth.users(id) VALUES(${O}),(${T}),(${A}),(${SA})`;
  await db`INSERT INTO user_roles(user_id,role) VALUES(${O},'office'),(${T},'teacher'),(${A},'admin'),(${SA},'super_admin')`;
  await db`INSERT INTO seasons(id,name,start_date,end_date) VALUES(${S},'Synthetic','2026-12-01','2027-04-15')`;
  await db`INSERT INTO products(id,season_id,name,type,price,pricing_type,duration_minutes) VALUES(${P},${S},'Group synthetic','group',100,'tiered',120),(${F},${S},'Private synthetic','private',85,'hourly',60)`;
  await db`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES(${P},1,100),(${P},5,320)`;
  await db`INSERT INTO customers(id,first_name,last_name,email) VALUES(${id(8)},'Synthetic','Payer','synthetic@example.invalid')`;
  await db`INSERT INTO tickets(id,ticket_number,customer_id,total_amount,status) VALUES(${id(9)},'SYNTHETIC-ONLY',${id(8)},320,'confirmed')`;
  const before=await history();
  await run('migration is additive, no backfill or history writes',async()=>{psql('supabase/pending/product_public_offerings.sql');assert.deepEqual(await history(),before);assert.equal((await db`SELECT count(*)::int n FROM product_public_offerings`)[0].n,0);});
  await run('one 2h block Monday–Friday saved and read back',async()=>{assert.deepEqual(await save(P,one),one);assert.deepEqual((await db`SELECT time_blocks FROM product_public_offerings WHERE product_id=${P}`)[0].time_blocks,one.time_blocks);});
  await run('Wednesdays and replay keep one product row',async()=>{const o={...one,weekdays:[3]};await save(P,o);assert.deepEqual(await save(P,o),o);assert.equal((await db`SELECT count(*)::int n FROM product_public_offerings WHERE product_id=${P}`)[0].n,1);});
  await run('five explicit Saturdays retain non-sorted order on reload',async()=>{const o={...one,schedule_kind:'explicit_dates',weekdays:[],dates:['2027-01-30','2027-01-02','2027-01-09','2027-01-16','2027-01-23']};assert.deepEqual(await save(P,o),o);});
  await run('out-of-season rejects atomically without changing saved metadata',async()=>{const before=await db`SELECT * FROM product_public_offerings`;await assert.rejects(save(P,{...one,schedule_kind:'explicit_dates',weekdays:[],dates:['2027-05-01']}),/outside season/);assert.deepEqual(await db`SELECT * FROM product_public_offerings`,before);});
  await run('overlap and mismatched duration rejected',async()=>{await assert.rejects(save(P,{...one,time_blocks:[{start:'10:00',end:'12:00'},{start:'11:00',end:'13:00'}]}),/overlapping/);await assert.rejects(save(P,{...one,time_blocks:[{start:'10:00',end:'11:00'}]}),/duration/);});
  await run('malformed blocks, duplicate/invalid weekdays and dates rejected',async()=>{for(const o of [{...one,weekdays:[0]},{...one,weekdays:[3,3]},{...one,time_blocks:[{start:'24:00',end:'25:00'}]},{...one,time_blocks:[{}]},{...one,schedule_kind:'explicit_dates',weekdays:[],dates:['2027-01-02','2027-01-02']}])await assert.rejects(save(P,o));});
  await run('flexible private has no forced clock, group rejected',async()=>{const o={schedule_kind:'flexible_private',weekdays:[],dates:[],time_blocks:[]};assert.deepEqual(await save(F,o),o);await assert.rejects(save(P,o),/private/);});
  await run('teacher actor rejected; office/admin/super_admin accepted',async()=>{await assert.rejects(save(P,one,T),/Forbidden/);for(const actor of [O,A,SA])assert.deepEqual(await save(P,one,actor),one);});
  await run('anon/teacher cannot read and authenticated cannot write or execute RPC',async()=>{const p=(await db`SELECT has_table_privilege('anon','public.product_public_offerings','SELECT') a,has_table_privilege('authenticated','public.product_public_offerings','INSERT') i,has_function_privilege('authenticated','public.save_product_public_offering(uuid,jsonb,uuid)','EXECUTE') e,has_function_privilege('anon','public.save_product_public_offering(uuid,jsonb,uuid)','EXECUTE') ae,has_function_privilege('service_role','public.save_product_public_offering(uuid,jsonb,uuid)','EXECUTE') se`)[0];assert.deepEqual(p,{a:false,i:false,e:false,ae:false,se:true});
    for(const [actor,count] of [[T,0],[O,2],[A,2],[SA,2]]) {await db.begin(async tx=>{await tx`SET LOCAL ROLE authenticated`;await tx`SELECT set_config('request.jwt.claim.sub',${actor},true)`;assert.equal((await tx`SELECT count(*)::int n FROM product_public_offerings`)[0].n,count);});}
  });
  await run('metadata removal only removes offering; historic rows and prices untouched',async()=>{await save(P,null);assert.equal((await db`SELECT count(*)::int n FROM product_public_offerings WHERE product_id=${P}`)[0].n,0);assert.deepEqual(await history(),before);});
  await run('two 4h blocks save while five-day tier remains exactly 320 once',async()=>{await db`UPDATE products SET duration_minutes=240 WHERE id=${P}`;await save(P,{...one,time_blocks:[{start:'10:00',end:'12:00'},{start:'14:00',end:'16:00'}]});const rows=await db`SELECT day_count,cumulative_price FROM product_price_tiers WHERE product_id=${P} AND day_count=5`;assert.equal(rows.length,1);assert.equal(Number(rows[0].cumulative_price),320);await db`UPDATE products SET duration_minutes=120 WHERE id=${P}`;});
  await run('rollback removes only new schema, no history/price changes',async()=>{psql('supabase/rollback/product_public_offerings_rollback.sql',false);assert.equal((await db`SELECT to_regclass('public.product_public_offerings') t`)[0].t,null);assert.deepEqual(await history(),before);});
} finally {if(db)await db.end();await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}
console.log(`${pass}/${pass+fail} passed`);if(fail)process.exit(1);
