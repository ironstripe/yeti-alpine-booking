import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const sourceSql=fs.readFileSync(path.join(root,'supabase/migrations/20261001194500_malbun_2627_product_drafts.sql'),'utf8');
const source=JSON.parse(sourceSql.match(/\$bc_json\$(\{.*?\})\$bc_json\$/s)?.[1]??'null');
const manifest=fs.readFileSync(path.join(root,'data/bc-2627/course-manifest-not-active.csv'),'utf8');
const output='/tmp/yeti-bc-course-import-test.sql';
const {spawnSync}=await import('node:child_process');
const generated=spawnSync('python3',['scripts/build_bc_2627_course_import.py','data/bc-2627/course-manifest-not-active.csv',output],{cwd:root,encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr);
const sql=fs.readFileSync(output,'utf8');
assert.match(sql,/3210 two-hour instances/);
const db=new PGlite();
setInterval(()=>console.log('Synthetic course import still running (no Cloud writes)'),30000).unref();
console.log('PGlite fixture: preparing 15 products and 121 tariff-source rows');
await db.exec(`CREATE TABLE seasons(id uuid PRIMARY KEY,name text,start_date date,end_date date,is_current boolean);
 CREATE TABLE products(id uuid PRIMARY KEY,season_id uuid,type text,discipline text,audience text,is_active boolean,min_age integer,max_age integer);
 CREATE TABLE bc_product_tariff_sources(source_id text PRIMARY KEY,season_id uuid,product_id uuid,source_sha256 text,import_status text,source_payload jsonb);
 CREATE TABLE skill_levels(id text PRIMARY KEY);
 CREATE TABLE group_courses(id uuid PRIMARY KEY,name text,description text,discipline text,skill_level_id text REFERENCES skill_levels(id),min_age int,max_age int,max_participants int,price_per_day numeric,product_id uuid REFERENCES products(id),is_active boolean,is_internal boolean,course_type text,period_start_date date,period_end_date date);
 CREATE OR REPLACE FUNCTION validate_group_course_ages() RETURNS trigger LANGUAGE plpgsql AS $guard$ BEGIN IF NEW.min_age <= 0 THEN RAISE EXCEPTION 'min_age must be greater than 0'; END IF; IF NEW.max_age < NEW.min_age THEN RAISE EXCEPTION 'max_age less than min_age'; END IF; IF NEW.max_age > 99 THEN RAISE EXCEPTION 'max_age must not exceed 99'; END IF; RETURN NEW; END; $guard$;
 CREATE TRIGGER validate_group_course_ages_trigger BEFORE INSERT OR UPDATE ON group_courses FOR EACH ROW EXECUTE FUNCTION validate_group_course_ages();
 CREATE TABLE training_groups(id uuid PRIMARY KEY,course_id uuid REFERENCES group_courses(id),week_start date,group_number int,status text,instructor_id uuid,assistant_instructor_id uuid,UNIQUE(course_id,week_start,group_number));
 CREATE TABLE group_course_schedules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid REFERENCES group_courses(id),day_of_week int,start_time time,end_time time,is_active boolean);
 CREATE TABLE group_course_instances(id uuid PRIMARY KEY,course_id uuid REFERENCES group_courses(id),schedule_id uuid REFERENCES group_course_schedules(id),date date,start_time time,end_time time,instructor_id uuid,assistant_instructor_id uuid,status text,current_participants int,UNIQUE(course_id,date,start_time));
 CREATE TABLE training_course_dates(id uuid PRIMARY KEY,training_id uuid REFERENCES group_courses(id),date date,is_cancelled boolean,instructor_id uuid);
 INSERT INTO seasons VALUES ('aaaaaaaa-0000-4000-8000-000000000001','Winter 26/27','2026-12-01','2027-04-15',true);`);
const sha='b5db33ab54a9c9565edd6541461a3b982afc4a5f78ded6bbd833e99ee3f14d67';
const productByKey=new Map(source.products.map(x=>[x.product_key,x]));
for(const p of source.products){
 const min=p.type==='private'?null:p.audience==='adults'?17:p.type==='group_toddler'?3:0;
 const max=p.type==='private'?null:p.audience==='adults'?120:p.type==='group_toddler'?6:16;
 await db.query('INSERT INTO products VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[p.product_id,'aaaaaaaa-0000-4000-8000-000000000001',p.type,p.discipline,p.audience,false,min,max]);
}
for(const t of source.tariffs){
 await db.query('INSERT INTO bc_product_tariff_sources VALUES ($1,$2,$3,$4,$5,$6)',[
  String(t.source_id),'aaaaaaaa-0000-4000-8000-000000000001',productByKey.get(t.product_key)?.product_id??null,sha,t.status,JSON.stringify(t)]);
}
const levels=new Set([...manifest.matchAll(/(?:NEW:)?(?:ski|sb)_[a-z_]+/g)].map(x=>x[0].replace('NEW:','')));
for(const level of levels)await db.query('INSERT INTO skill_levels VALUES ($1)',[level]);
console.log('PGlite fixture ready; running 370-period import');
await db.exec(sql);
const counts=await db.query(`SELECT
 (SELECT count(*)::int FROM group_courses) templates,
 (SELECT count(*)::int FROM training_groups) groups,
 (SELECT count(*)::int FROM group_course_instances) lessons,
 (SELECT count(*)::int FROM training_course_dates) saturday_dates,
 (SELECT count(*)::int FROM bc_2627_course_period_sources) source_rows,
 (SELECT count(*)::int FROM bc_2627_course_product_variants) product_links,
 (SELECT count(*)::int FROM group_courses WHERE is_active) active_courses,
 (SELECT count(*)::int FROM group_course_instances WHERE instructor_id IS NOT NULL) assigned_teachers,
 (SELECT count(*)::int FROM group_course_instances WHERE schedule_id IS NULL) missing_schedules`);
const c=counts.rows[0];
assert.equal(c.templates,32);assert.equal(c.groups,370);assert.equal(c.lessons,3210);assert.equal(c.saturday_dates,150);assert.equal(c.source_rows,370);
assert.equal(c.active_courses,0);assert.equal(c.assigned_teachers,0);assert.equal(c.missing_schedules,0);
assert.equal((await db.query('SELECT count(*)::int AS n FROM group_courses WHERE min_age<1 OR max_age>99')).rows[0].n,0);
assert.equal((await db.query('SELECT count(*)::int AS n FROM products WHERE is_active')).rows[0].n,0);
await assert.rejects(db.exec(sql),/Course import target collision \/ already applied/);
console.log('Verified:',JSON.stringify(c),'and repeated import refused without duplicates');
await db.close();
