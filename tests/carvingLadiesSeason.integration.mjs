// Disposable local PostgreSQL only; ignores every managed database environment variable.
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const conn={host:'/tmp',port:55432,username:'postgres',ssl:false,max:1,onnotice:()=>{}};
const name=`carving_season_${Date.now()}`;
const admin=postgres({...conn,database:'postgres'});
let db;let passed=0;
const P='8fe2a11e-362d-4f05-8964-87d6b214fc3e',S='f185b448-e6aa-46b8-94ae-0875a7a6c166',A='d27b11a0-c8fc-46f6-a38b-edf2980221fc',C='5029b32f-3bfb-4c2d-93b9-b8ac81d6bce7';
const script=readFileSync('scripts/one-off/carving_ladies_season.sql','utf8');
const sql=script.replace(/^\\set.*$/mg,'');
const tables=['products','seasons','product_price_tiers','product_public_offerings','group_courses','group_course_schedules','group_course_instances','training_groups','tickets','ticket_items','invoices','payments','instructor_notification_queue','notification_queue','email_logs','whatsapp_notifications'];
const snapshot=async()=>{const out={};for(const t of tables)out[t]=await db.unsafe(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) rows FROM ${t} x`);return out;};
const run=async(label,fn)=>{await fn();console.log('PASS',label);passed++;};
const file=f=>{const r=spawnSync('psql',['-h','/tmp','-p','55432','-U','postgres','-d',name,'-q','-v','ON_ERROR_STOP=1','-1','-f',f],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
const rejected=async(text,pattern)=>{await assert.rejects(db.unsafe(text),pattern);await db.unsafe('ROLLBACK');};
try{
 await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
 db=postgres({...conn,database:name});
 for(const f of ['tests/sql/baseline_prelude.sql','tests/sql/production_schema_baseline.sql','drizzle/migrations/0002_course_archive_delete.sql','supabase/pending/group_course_optional_ages.sql','supabase/pending/product_public_offerings.sql','supabase/pending/product_offering_display_text.sql','supabase/pending/product_offering_series.sql'])file(f);
 await db`INSERT INTO auth.users(id) VALUES(${A})`;await db`INSERT INTO user_roles(user_id,role) VALUES(${A},'super_admin')`;
 await db`INSERT INTO seasons(id,name,start_date,end_date) VALUES(${S},'Winter 26/27','2026-12-01','2027-04-15')`;
 await db`INSERT INTO products(id,name,type,price,season_id,discipline,audience,min_age,is_active,show_on_website,duration_minutes,pricing_type) VALUES(${P},'Carving Ladies','group',99,${S},'ski','adults',16,true,true,120,'fixed')`;
 await db`INSERT INTO product_public_offerings(product_id,schedule_kind,weekdays,dates,time_blocks,display_schedule_text,series,updated_at,updated_by) VALUES(${P},'weekly',ARRAY[3,7]::smallint[],'{}','[{"start":"14:00","end":"16:00"}]','Immer Sonntags','[]','2026-10-18T13:05:40.65099+00:00',${A})`;
 // A decoy inactive course with children makes preservation assertions non-empty.
 const D='11111111-1111-4111-8111-111111111111';
 await db`INSERT INTO group_courses(id,name,min_age,max_age,price_per_day,is_active) VALUES(${D},'Unrelated fixture',8,16,42,false)`;
 const schedule=(await db`INSERT INTO group_course_schedules(course_id,day_of_week,start_time,end_time) VALUES(${D},1,'10:00','12:00') RETURNING id`)[0].id;
 await db`INSERT INTO group_course_instances(course_id,schedule_id,date,start_time,end_time) VALUES(${D},${schedule},'2026-12-07','10:00','12:00')`;
 await db`INSERT INTO training_groups(course_id,week_start) VALUES(${D},'2026-12-07')`;
 let before;
 await run('source/season/actor/offering drift rejects before writing',async()=>{
 for(const [change,restore] of [[`UPDATE products SET price=100 WHERE id='${P}'`,`UPDATE products SET price=99 WHERE id='${P}'`],[`UPDATE seasons SET end_date='2027-04-18' WHERE id='${S}'`,`UPDATE seasons SET end_date='2027-04-15' WHERE id='${S}'`],[`UPDATE product_public_offerings SET weekdays=ARRAY[7]::smallint[] WHERE product_id='${P}'`,`UPDATE product_public_offerings SET weekdays=ARRAY[3,7]::smallint[] WHERE product_id='${P}'`],[`UPDATE user_roles SET role='teacher' WHERE user_id='${A}'`,`UPDATE user_roles SET role='super_admin' WHERE user_id='${A}'`]]){await db.unsafe(change);const prior=await snapshot();await rejected(sql,/changed|required/);assert.deepEqual(await snapshot(),prior);await db.unsafe(restore);}
 });
 await run('mid-write fault rolls back course/schedule/instances/shells together',async()=>{
 const prior=await snapshot();await rejected(sql.replace('GET DIAGNOSTICS n=ROW_COUNT; IF n<>19',"RAISE EXCEPTION 'injected mid-write fault'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>19"),/injected mid-write fault/);assert.deepEqual(await snapshot(),prior);
 });
 await run('concurrent offering editor blocks whole plan with no writes',async()=>{
 const other=postgres({...conn,database:name});try{await other.unsafe('BEGIN; LOCK TABLE product_public_offerings IN ROW EXCLUSIVE MODE');const prior=await snapshot();await rejected(sql,/lock/);assert.deepEqual(await snapshot(),prior);}finally{await other.unsafe('ROLLBACK');await other.end();}
 });
 await run('creates exactly one course, one Sunday schedule, 19 occurrences and 19 shells',async()=>{
 before=await snapshot();
 const result=spawnSync('psql',['-X','-h','/tmp','-p','55432','-U','postgres','-d',name,'-v','ON_ERROR_STOP=1','-f','scripts/one-off/carving_ladies_season.sql'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const c=(await db`SELECT name,product_id,course_type,skill_level_id,min_age,max_age,min_participants,max_participants,price_per_day,is_internal FROM group_courses WHERE id=${C}`)[0];
 assert.deepEqual(c,{name:'Ski · Carving Ladies',product_id:P,course_type:'weekly',skill_level_id:null,min_age:16,max_age:null,min_participants:1,max_participants:8,price_per_day:'99.00',is_internal:false});
 assert.deepEqual((await db`SELECT day_of_week,start_time,end_time FROM group_course_schedules WHERE course_id=${C}`),[{day_of_week:0,start_time:'14:00:00',end_time:'16:00:00'}]);
 const dates=(await db`SELECT date::text date FROM group_course_instances WHERE course_id=${C} ORDER BY date`).map(r=>r.date);
 assert.deepEqual(dates,['2026-12-06','2026-12-13','2026-12-20','2026-12-27','2027-01-03','2027-01-10','2027-01-17','2027-01-24','2027-01-31','2027-02-07','2027-02-14','2027-02-21','2027-02-28','2027-03-07','2027-03-14','2027-03-21','2027-03-28','2027-04-04','2027-04-11']);
 assert.equal((await db`SELECT count(*)::int n FROM training_groups WHERE course_id=${C}`)[0].n,19);
 });
 await run('FK relations and Monday shells correct, no teacher assignments',async()=>{
 assert.equal((await db`SELECT count(*)::int n FROM group_course_instances i JOIN group_course_schedules s ON s.id=i.schedule_id AND s.course_id=i.course_id JOIN training_groups g ON g.course_id=i.course_id AND g.week_start=i.date-6 AND g.group_number=1 WHERE i.course_id=${C} AND extract(isodow FROM g.week_start)=1 AND i.instructor_id IS NULL AND i.assistant_instructor_id IS NULL AND g.instructor_id IS NULL AND g.assistant_instructor_id IS NULL`)[0].n,19);
 });
 await run('all unrelated records, offerings, prices, billing and notifications unchanged',async()=>{
 const after=await snapshot();for(const t of ['group_courses','group_course_schedules','group_course_instances','training_groups'])after[t][0].rows=after[t][0].rows.filter(r=>t==='group_courses'?r.id!==C:r.course_id!==C);assert.deepEqual(after,before);
 });
 await run('rerun fails closed without changing any row',async()=>{const prior=await snapshot();await rejected(sql,/already exists/);assert.deepEqual(await snapshot(),prior);});
 await run('future generators insert zero duplicates for all 19 existing weeks (LOCAL ONLY)',async()=>{
 // Baseline is_admin_or_office predates super_admin support; synthetic admin role
 // exercises the authorized generators without changing the seed actor guard.
 await db`INSERT INTO user_roles(user_id,role) VALUES(${A},'admin')`;
 const prior=await snapshot();await db.begin(async tx=>{await tx`SELECT set_config('request.jwt.claim.sub',${A},true)`;for(const row of await tx`SELECT week_start FROM training_groups WHERE course_id=${C} ORDER BY week_start`){const r=(await tx`SELECT generate_group_course_instances_for_week(${row.week_start}::date) result`)[0].result;assert.equal(r.instances_created,0);const g=(await tx`SELECT generate_training_groups_for_week(${row.week_start}::date) result`)[0].result;assert.equal(g.groups_created,0);}});assert.deepEqual(await snapshot(),prior);
 });
 console.log(`${passed}/${passed} passed; disposable database only`);
}finally{await db?.end();await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}
