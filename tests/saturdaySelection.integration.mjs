// Local disposable PostgreSQL only: real atomic save + server-read selection facts.
import postgres from 'postgres';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {checkSaturdaySelection} from '../supabase/functions/_shared/saturdaySelection.ts';
const admin=postgres({host:'/tmp',port:55432,username:'postgres',database:'postgres',ssl:false,onnotice:()=>{}});
const name=`saturday_selection_${Date.now()}`;
await admin.unsafe(`CREATE DATABASE ${name}`);
const sql=postgres({host:'/tmp',port:55432,username:'postgres',database:name,ssl:false,onnotice:()=>{}});
const uri=`postgres://postgres@localhost/${name}?host=/tmp&port=55432`;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const S=id(1),P=id(2),W=id(3),C=id(4),A=id(5),U=id(6),PA=id(7),CW=id(8);
const first=['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06'];
const second=['2027-02-20','2027-02-27','2027-03-06','2027-03-13','2027-03-20'];
let passed=0;
const db={from(table){const filters=[]; const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle:async()=>{const r=await q;return {...r,data:r.data?.[0]??null}},then(resolve,reject){return (async()=>{let rows; if(table==='group_courses') rows=await sql`SELECT course_type,skill_level_id FROM group_courses WHERE id=${filters[0][1]}`; else if(table==='products') rows=await sql`SELECT type FROM products WHERE id=${filters[0][1]}`; else if(table==='bc_product_tariff_sources') rows=await sql`SELECT source_family FROM bc_product_tariff_sources WHERE product_id=${filters[0][1]}`; else rows=await sql`SELECT source_key,eligible_variants,ARRAY(SELECT x::text FROM unnest(teaching_dates) x) teaching_dates FROM bc_2627_course_period_sources WHERE course_id=${filters[0][1]}`; return {data:rows,error:null};})().then(resolve,reject)}};return q}};
try {
  for(const f of ['tests/sql/baseline_prelude.sql','tests/sql/production_schema_baseline.sql','drizzle/migrations/0002_course_archive_delete.sql','drizzle/migrations/0003_bc_2627_staff_group_booking.sql','drizzle/migrations/0005_bc_2627_staff_group_book_v2.sql','drizzle/migrations/0006_staff_booking_finalize.sql','drizzle/migrations/0007_staff_guest_level.sql']) {
    const r=spawnSync('psql',[uri,'-q','-v','ON_ERROR_STOP=1','-f',f],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
  }
  await sql`INSERT INTO auth.users(id,email) VALUES (${A},'test@example.invalid')`;
  await sql`INSERT INTO seasons(id,name,start_date,end_date) VALUES (${S},'Winter 26/27','2026-12-01','2027-04-15')`;
  await sql`INSERT INTO customers(id,first_name,last_name,email) VALUES (${U},'Test','Only','customer@example.invalid')`;
  await sql`INSERT INTO customer_participants(id,customer_id,first_name,birth_date) VALUES (${PA},${U},'Test','2020-01-01')`;
  for(const [p,type,dur,prices] of [[P,'group',240,[150,200,245,285,320]],[W,'group_toddler',120,[70,110,140]]]) {
    await sql`INSERT INTO products(id,name,type,season_id,price,is_active,duration_minutes) VALUES (${p},'No name inference',${type},${S},0,true,${dur})`;
    for(const [i,price] of prices.entries()) {
      await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES (${p},${i+1},${price})`;
      await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload) VALUES (${p+'-'+i},${S},${p},'sha','Samstagkurs','draft',${i+1},${dur},1,${price},'{}')`;
    }
  }
  await sql`INSERT INTO skill_levels(id,name,discipline,target_group,sort_order) VALUES ('ski_blauer_prinz','Test','ski','child',1),('ski_windel_wedel','Test','ski','child',2),('ski_blauer_star','Test','ski','child',3)`;
  for(const [c,p,level] of [[C,P,'ski_blauer_prinz'],[CW,W,'ski_windel_wedel']]) {
    await sql`INSERT INTO group_courses(id,name,discipline,min_age,max_age,price_per_day,product_id,course_type,skill_level_id,meeting_point) VALUES (${c},'Same label','ski',2,16,0,${p},'saturday_course',${level},'malbipark')`;
    await sql`INSERT INTO bc_2627_course_product_variants VALUES (${c},${p},${p===W?[1,2,3]:[1,2,3,4,5]}::int[])`;
    for(const [n,days] of [first,second].entries()) {
      const tg=(await sql`INSERT INTO training_groups(course_id,week_start,status) VALUES (${c},${n===0?'2027-01-04':'2027-02-15'},'active') RETURNING id`)[0].id;
      await sql`INSERT INTO bc_2627_course_period_sources(source_key,course_id,training_group_id,source_sha256,tariff_source_ids,teaching_dates,eligible_variants) VALUES (${c+'-'+n},${c},${tg},'sha','{}',${days}::date[],${sql.json({[p]:p===W?[1,2,3]:[1,2,3,4,5]})})`;
      for(const d of days) for(const [start,end] of p===W?[['10:00','12:00']]:[['10:00','12:00'],['14:00','16:00']]) await sql`INSERT INTO group_course_instances(course_id,date,start_time,end_time) VALUES (${c},${d},${start},${end})`;
    }
  }
  const counts=async()=>(await sql`SELECT (SELECT count(*) FROM tickets)::int t,(SELECT count(*) FROM ticket_items)::int i,(SELECT count(*) FROM group_course_enrollments)::int e`)[0];
  for(const [c,p,dates] of [[C,P,[first[2]]],[CW,W,first.slice(0,4)],[CW,W,[first[1]]],[C,P,[first[0],second[0]]]]) {
    const before=await counts();assert.ok(await checkSaturdaySelection(db,c,p,dates));assert.deepEqual(await counts(),before);passed++;
  }
  for(const [c,p,dates,price,blocks] of [[CW,W,[first[0],first[3],first[4]],140,3],[C,P,second,320,10]]) {
    assert.equal(await checkSaturdaySelection(db,c,p,dates),null);
    const payload={submission_key:'saturday-test-'+c,customer_id:U,lines:[{course_id:c,product_id:p,participant_id:PA,dates,block:p===W?'am':null,expected_unit_price:price}]};
    const r=(await sql`SELECT bc_2627_staff_group_book(${sql.json(payload)},${A}) r`)[0].r;assert.equal(r.ok,true,JSON.stringify(r));assert.equal(Number(r.total),price);
    const rows=await sql`SELECT product_id,quantity,unit_price,line_total FROM ticket_items WHERE ticket_id=${r.ticket_id}`;assert.equal(rows.length,1);assert.equal(rows[0].product_id,p);assert.equal(Number(rows[0].quantity),1);assert.equal(Number(rows[0].line_total),price);
    const en=await sql`SELECT ARRAY(SELECT DISTINCT i.date::text FROM group_course_enrollments e JOIN group_course_instances i ON i.id=e.instance_id JOIN ticket_items t ON t.id=e.ticket_item_id WHERE t.ticket_id=${r.ticket_id} ORDER BY 1) dates,(SELECT count(*) FROM group_course_enrollments e JOIN ticket_items t ON t.id=e.ticket_item_id WHERE t.ticket_id=${r.ticket_id})::int n`;assert.deepEqual(en[0].dates,[...dates].sort());assert.equal(en[0].n,blocks);
    const before=await counts();const replay=(await sql`SELECT bc_2627_staff_group_book(${sql.json(payload)},${A}) r`)[0].r;assert.equal(replay.replayed,true);assert.deepEqual(await counts(),before);passed++;
  }
  await sql`UPDATE group_courses SET skill_level_id='ski_blauer_star' WHERE id=${C}`;
  assert.equal(await checkSaturdaySelection(db,C,P,[first[4]]),null);passed++;
  console.log(`${passed}/7 local server-facts/persistence checks passed; database discarded`);
} finally {await sql.end();await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();}