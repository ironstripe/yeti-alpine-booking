import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync(new URL('../supabase/migrations/20261002222000_bc_2627_course_levels.sql',import.meta.url),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE public.skill_levels(id text PRIMARY KEY,name text NOT NULL,discipline text NOT NULL CHECK(discipline IN ('ski','snowboard')),target_group text NOT NULL CHECK(target_group IN ('child','adult')),color text,sort_order integer NOT NULL,description text,min_age integer,max_age integer,is_active boolean);
 INSERT INTO public.skill_levels VALUES ('ski_academy','Academy Ski','ski','child','black',10,NULL,NULL,NULL,true);`);
 return db;
}
let db=await fixture();
await db.exec(sql);
const r=(await db.query(`SELECT id,target_group,discipline,min_age,max_age FROM public.skill_levels WHERE id<>'ski_academy' ORDER BY id`)).rows;
assert.equal(r.length,5);
assert.deepEqual(new Set(r.map(x=>x.id)),new Set(['ski_schwarzer_koenig','ski_kids_advanced','ski_adult_returners','sb_youth_beginner','sb_youth_advanced']));
for(const x of r){
 if(x.target_group==='child') assert.deepEqual([x.min_age,x.max_age],[0,16]);
 else assert.deepEqual([x.id,x.min_age,x.max_age],['ski_adult_returners',17,null]);
}
assert.equal(r.filter(x=>x.discipline==='snowboard').length,2);
await assert.rejects(db.exec(sql),/target ID collision/);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.skill_levels')).rows[0].n,6);
await db.close();
db=await fixture();
await db.exec(`INSERT INTO public.skill_levels VALUES ('sb_youth_beginner','Manually owned','snowboard','child',NULL,1,NULL,0,16,true)`);
await assert.rejects(db.exec(sql),/target ID collision/);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.skill_levels')).rows[0].n,2);
await db.close();
console.log('five exact 26/27 course levels; collision rollback; other levels preserved');
