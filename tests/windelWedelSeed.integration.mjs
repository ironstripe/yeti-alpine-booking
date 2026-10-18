// Disposable local actual-schema PostgreSQL only; never reads project PG environment.
// Narrow check for supabase/pending/windel_wedel_series_seed.sql: passes against the
// live-reviewed group_toddler fixture and fails closed (no writes) on any guard change.
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const conn={host:'/tmp',port:55432,username:'postgres',ssl:false,onnotice:()=>{},max:1};
const name=`windel_seed_${Date.now()}`;
const admin=postgres({...conn,database:'postgres'});
let db; let pass=0;let fail=0;
const PRODUCT='e25c5f7c-939a-54d5-b355-102ad585dd54';
const COURSE='45688ab3-2253-b796-bdfb-545ccb3bec4d';
const ACTOR='d27b11a0-c8fc-46f6-a38b-edf2980221fc';
const BLOCKS='[{"start":"10:00","end":"12:00"}]';
const SERIES='[{"sequence":1,"label":null,"start_date":"2027-01-09","end_date":"2027-02-06","max_selected_days":3},{"sequence":2,"label":null,"start_date":"2027-02-20","end_date":"2027-03-20","max_selected_days":3}]';
const psql=(file,vars={},singleTx=true)=>{
  const args=['-h','/tmp','-p','55432','-U','postgres','-d',name,'-q','-v','ON_ERROR_STOP=1'];
  for(const [k,v] of Object.entries(vars))args.push('-v',`${k}=${v}`);
  if(singleTx)args.push('-1');
  args.push('-f',fileURLToPath(new URL('../'+file,import.meta.url)));
  return spawnSync('psql',args,{encoding:'utf8'});
};
const seed=()=>psql('supabase/pending/windel_wedel_series_seed.sql',{reviewed_time_blocks:BLOCKS,staff_actor:ACTOR},false);
const snapshot=async()=>{const result={};for(const t of ['products','product_price_tiers','group_courses','group_course_schedules','user_roles'])result[t]=await db.unsafe(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) rows FROM public.${t} t`);return result;};
const run=async(label,fn)=>{try{await fn();console.log('PASS',label);pass++;}catch(e){console.log('FAIL',label,e.message);fail++;}};
const firstSaturdays=['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06'];
const secondSaturdays=['2027-02-20','2027-02-27','2027-03-06','2027-03-13','2027-03-20'];
try {
  await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
  db=postgres({...conn,database:name});
  for(const f of ['tests/sql/baseline_prelude.sql','tests/sql/production_schema_baseline.sql','supabase/pending/product_public_offerings.sql','supabase/pending/product_offering_display_text.sql','supabase/pending/product_offering_series.sql']){
    const r=psql(f);assert.equal(r.status,0,r.stderr);
  }
  const season='11111111-1111-4111-8111-111111111111';
  await db`INSERT INTO auth.users(id) VALUES(${ACTOR})`;
  await db`INSERT INTO user_roles(user_id,role) VALUES(${ACTOR},'super_admin')`;
  await db`INSERT INTO seasons(id,name,start_date,end_date) VALUES(${season},'Synthetic','2026-12-01','2027-04-30')`;
  await db`INSERT INTO products(id,season_id,name,type,price,pricing_type,duration_minutes) VALUES(${PRODUCT},${season},'WINDel-Wedel','group_toddler',70,'tiered',120)`;
  await db`INSERT INTO group_courses(id,name,product_id,is_active,course_type,min_age,max_age,price_per_day) VALUES(${COURSE},'WINDel-Wedel',${PRODUCT},true,'saturday_course',2,6,70)`;
  await db`INSERT INTO group_course_schedules(course_id,day_of_week,start_time,end_time,is_active) VALUES(${COURSE},6,'10:00','12:00',true)`;
  await db`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES(${PRODUCT},1,70),(${PRODUCT},2,110),(${PRODUCT},3,140)`;
  await run('precondition: offering row absent for target product',async()=>{
    assert.equal((await db`SELECT count(*)::int n FROM product_public_offerings WHERE product_id=${PRODUCT}`)[0].n,0);
  });
  await run('seed succeeds on live-reviewed group_toddler fixture with exact series, weekdays and block',async()=>{
    const before=await snapshot();
    const r=seed();assert.equal(r.status,0,r.stderr);
    const row=(await db`SELECT schedule_kind,weekdays,dates,time_blocks,display_schedule_text,series FROM product_public_offerings WHERE product_id=${PRODUCT}`)[0];
    assert.deepEqual(row,{schedule_kind:'weekly',weekdays:[6],dates:[],time_blocks:[{start:'10:00',end:'12:00'}],display_schedule_text:null,series:JSON.parse(SERIES)});
    assert.deepEqual(await snapshot(),before);
  });
  await run('exactly one offering row and generated series dates are five Saturdays each',async()=>{
    assert.equal((await db`SELECT count(*)::int n FROM product_public_offerings WHERE product_id=${PRODUCT}`)[0].n,1);
    const dates=(await db`SELECT series FROM product_public_offerings WHERE product_id=${PRODUCT}`)[0].series;
    assert.equal(dates.length,2);
  });
  await run('seed fails closed on wrong product type with no side effects',async()=>{
    const prior=await db`SELECT * FROM product_public_offerings`;
    await db`DELETE FROM product_public_offerings WHERE product_id=${PRODUCT}`;
    await db`UPDATE products SET type='group' WHERE id=${PRODUCT}`;
    const before=await snapshot();
    const r=seed();assert.notEqual(r.status,0,'seed must fail on type mismatch');
    assert.match((r.stderr||'')+(r.stdout||''),/Reviewed product missing or changed/);
    assert.deepEqual(await snapshot(),before);
    assert.equal((await db`SELECT count(*)::int n FROM product_public_offerings WHERE product_id=${PRODUCT}`)[0].n,0);
    await db`UPDATE products SET type='group_toddler' WHERE id=${PRODUCT}`;
    void prior;
  });
  await run('seed succeeds again after restoring the reviewed type (idempotent rerun on clean state)',async()=>{
    const r=seed();assert.equal(r.status,0,r.stderr);
    assert.equal((await db`SELECT count(*)::int n FROM product_public_offerings WHERE product_id=${PRODUCT}`)[0].n,1);
  });
  await run('seed refuses to overwrite an existing offering',async()=>{
    const prior=await db`SELECT * FROM product_public_offerings`;
    const r=seed();assert.notEqual(r.status,0);
    assert.match((r.stderr||'')+(r.stdout||''),/Offering now exists/);
    assert.deepEqual(await db`SELECT * FROM product_public_offerings`,prior);
  });
  console.log(`\n${pass} passed, ${fail} failed`);
  if(fail>0)process.exitCode=1;
} finally {
  await db?.end();await admin?.end();
  await admin`DROP DATABASE IF EXISTS ${admin(name)}`.catch(()=>{});
}
