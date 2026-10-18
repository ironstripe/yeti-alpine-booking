// Disposable actual-schema PostgreSQL only. No production env/connection accepted.
// BC_TEST_PGSOCKET=/tmp bun tests/publicPrivateTariffDisplay.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const host=process.env.BC_TEST_PGSOCKET ?? '/tmp';
assert.ok(host.startsWith('/tmp'),'local socket only');
const opts={host,port:55432,username:'postgres',ssl:false,onnotice:()=>{}};
const admin=postgres({...opts,database:'postgres',max:1});
const name=`display_tariffs_${Date.now()}`;await admin.unsafe(`CREATE DATABASE ${name}`);
const sql=postgres({...opts,database:name,max:4});
const actor='00000000-0000-4000-8000-000000000001';
const season='f185b448-e6aa-46b8-94ae-0875a7a6c166';
const ids=['3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'];
const source=readFileSync('supabase/pending/public_private_tariff_display_seed.sql','utf8');
const info=JSON.parse(source.split('$information$')[1]);
let passed=0;
const test=async(name,fn)=>{await fn();console.log(`PASS ${name}`);passed++;};
const file=(f)=>{const r=spawnSync('psql',['-X','-h',host,'-p','55432','-U','postgres','-d',name,'-q','-v','ON_ERROR_STOP=1','-v',`staff_actor=${actor}`,'-1','-f',f],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);};
const save=(p,i=info,rev=null,verify=false,a=actor,s=season)=>sql`SELECT public.save_public_private_tariff_display(${p}::uuid,${s}::uuid,${sql.json(i)}::jsonb,${rev}::int,${verify},${a}::uuid) AS r`.then(r=>r[0].r);
const snapshot=async()=>{const r={};for(const t of ['products','seasons','bc_product_tariff_sources','private_lesson_rates','product_price_tiers','private_appointments','ticket_items','invoices','group_courses','notifications'])r[t]=(await sql.unsafe(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') r FROM public.${t} t`))[0].r;return r;};
try {
 file('tests/sql/baseline_prelude.sql');file('tests/sql/production_schema_baseline.sql');file('supabase/pending/public_private_tariff_display.sql');
 await sql`INSERT INTO auth.users(id,email) VALUES(${actor},'synthetic@invalid.test')`;
 await sql`INSERT INTO user_roles(user_id,role) VALUES(${actor},'office')`;
 await sql`INSERT INTO seasons(id,name,start_date,end_date,is_current) VALUES(${season},'Winter 26/27','2026-12-01','2027-04-15',true),('00000000-0000-4000-8000-000000000099','Other','2027-12-01','2028-04-15',false)`;
 for(let n=0;n<ids.length;n++){
  await sql`INSERT INTO products(id,season_id,name,type,discipline,duration_minutes,price,pricing_type) VALUES(${ids[n]},${season},'Synthetic','private',${n?'snowboard':'ski'},${n?60:55},75,'fixed')`;
  for(const [mins,price] of [[60,75],[120,170]])await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload) VALUES(${`${n}-${mins}`},${season},${ids[n]},'synthetic','Private','draft',1,${mins},1,${price},'{}')`;
 }
 await sql`INSERT INTO products(id,season_id,name,type,price) VALUES('00000000-0000-4000-8000-000000000098',${season},'Unrelated','group',99)`;
 await sql`DELETE FROM private_lesson_rates`;
 for(const [start,end,rate,peak] of [['09:00','10:00',75,false],['10:00','12:00',85,true],['12:00','14:00',75,false],['14:00','16:00',85,true]])await sql`INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour,is_peak,additional_person_rate) VALUES(${start},${end},${rate},${peak},20)`;
 const before=await snapshot();
 await test('target-only seed: two unverified products, 11 typed windows each',async()=>{file('supabase/pending/public_private_tariff_display_seed.sql');const r=await sql`SELECT * FROM public_private_tariff_display ORDER BY product_id`;assert.equal(r.length,2);for(const row of r){assert.equal(row.season_id,season);assert.equal(row.windows.length,11);assert.equal(row.verified_at,null);assert.deepEqual(row.windows,info.windows);}assert.deepEqual(r.map(r=>r.product_id).sort(),ids.slice().sort());});
 await test('six double windows and exact user amounts/supplements',async()=>{assert.deepEqual(info.windows.filter(w=>w.duration_minutes===120).map(w=>[w.start,w.end,w.amount_chf,w.extra_person_chf]),[['09:00','11:00',160,40],['10:00','12:00',190,40],['11:00','13:00',160,40],['12:00','14:00',150,40],['13:00','15:00',160,40],['14:00','16:00',190,40]]);});
 await test('three standard single windows',async()=>{assert.deepEqual(info.windows.filter(w=>w.duration_minutes===60&&w.classification==='standard').map(w=>[w.start,w.end,w.amount_chf,w.extra_person_chf]),[['09:00','10:00',75,20],['12:00','13:00',75,20],['13:00','14:00',75,20]]);});
 await test('two within-window office exceptions, not regular slots',async()=>{assert.deepEqual(info.windows.filter(w=>w.classification==='office_exception').map(w=>[w.start,w.end,w.duration_minutes,w.amount_chf,w.window_kind]),[['10:00','12:00',60,85,'within'],['14:00','16:00',60,85,'within']]);});
 await test('discount wording preserved as unverified information, not operational hours',async()=>{assert.equal(info.discount_percent,10);assert.equal(info.discount_threshold,4);assert.equal(info.discount_unit,'lessons');assert.equal(info.discount_scope,'same_participant_same_day');});
 await test('rerun rejects without overwriting',async()=>{assert.throws(()=>file('supabase/pending/public_private_tariff_display_seed.sql'),/already entered/);});
 await test('atomic malformed window rejection retains revision',async()=>{await assert.rejects(save(ids[0],{...info,windows:[...info.windows,{...info.windows[0],end:'09:30'}]},1),/Invalid display/);assert.equal((await sql`SELECT revision FROM public_private_tariff_display WHERE product_id=${ids[0]}`)[0].revision,1);});
 await test('staff save/reload verifies; next edit resets verification',async()=>{const r=await save(ids[0],info,1,true);assert.equal(r.revision,2);assert.equal(r.verified_by,actor);assert.ok(r.verified_at);const next=await save(ids[0],info,2,false);assert.equal(next.revision,3);assert.equal(next.verified_at,null);});
 await test('optimistic stale revision rejected',async()=>{await assert.rejects(save(ids[0],info,1,true),/Concurrent change/);});
 await test('non-staff actor and wrong season/type rejected',async()=>{await assert.rejects(save(ids[0],info,3,false,'00000000-0000-4000-8000-000000000010'),/Forbidden/);await assert.rejects(save(ids[0],info,null,false,actor,'00000000-0000-4000-8000-000000000099'),/mismatch/);await assert.rejects(save('00000000-0000-4000-8000-000000000098'),/mismatch/);});
 await test('anon and authenticated cannot execute save or mutate table',async()=>{for(const role of ['anon','authenticated']){const r=await sql`SELECT has_function_privilege(${role},'public.save_public_private_tariff_display(uuid,uuid,jsonb,integer,boolean,uuid)','EXECUTE') e,has_table_privilege(${role},'public.public_private_tariff_display','INSERT') i`;assert.equal(r[0].e,false);assert.equal(r[0].i,false);}const r=await sql`SELECT has_table_privilege('anon','public.public_private_tariff_display','SELECT') a,has_function_privilege('service_role','public.save_public_private_tariff_display(uuid,uuid,jsonb,integer,boolean,uuid)','EXECUTE') e`;assert.equal(r[0].a,false);assert.equal(r[0].e,true);});
 await test('RLS exposes rows only to authenticated staff',async()=>{await sql.begin(async tx=>{await tx`SET LOCAL ROLE authenticated`;await tx`SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000010',true)`;assert.equal((await tx`SELECT * FROM public_private_tariff_display`).length,0);await tx`SELECT set_config('request.jwt.claim.sub',${actor},true)`;assert.equal((await tx`SELECT * FROM public_private_tariff_display`).length,2);});});
 await test('unrelated seasons/products, BC, operational pricing/history unchanged',async()=>{assert.deepEqual(await snapshot(),before);});
 await test('rollback drops only new information structure',async()=>{file('supabase/rollback/public_private_tariff_display_rollback.sql');assert.equal((await sql`SELECT to_regclass('public.public_private_tariff_display') r`)[0].r,null);assert.deepEqual(await snapshot(),before);});
 console.log(`${passed}/14 passed`);
} finally {await sql.end();await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();}
