import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../supabase/migrations/',import.meta.url);
const text=fs.readFileSync(new URL('20261001194500_malbun_2627_product_drafts.sql',root),'utf8');
const src=JSON.parse(text.match(/\$bc_json\$(\{.*?\})\$bc_json\$/s)?.[1]??'null');
assert.equal(src.products.length,15);
const sql=fs.readFileSync(new URL('20261002221000_bc_2627_group_age_policy.sql',root),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE public.seasons(id uuid PRIMARY KEY,name text,start_date date,end_date date,is_current boolean);
 CREATE TABLE public.products(id uuid PRIMARY KEY,season_id uuid,type text,discipline text,audience text,is_active boolean,min_age integer,max_age integer);
 CREATE TABLE public.bc_product_tariff_sources(product_id uuid,import_status text);
 INSERT INTO public.seasons VALUES ('aaaaaaaa-0000-4000-8000-000000000001','Winter 26/27','2026-12-01','2027-04-15',true);`);
 for(const p of src.products){
  await db.query('INSERT INTO public.products VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL)',[
   p.product_id,'aaaaaaaa-0000-4000-8000-000000000001',p.type,p.discipline,p.audience,false]);
  await db.query('INSERT INTO public.bc_product_tariff_sources VALUES ($1,$2)',[p.product_id,'draft']);
 }
 return db;
}
let db=await fixture();
await db.exec(sql);
const r=await db.query(`SELECT type,audience,discipline,min_age,max_age,count(*)::int AS n
 FROM public.products GROUP BY type,audience,discipline,min_age,max_age ORDER BY type,audience,discipline`);
const by=(type,audience,discipline)=>r.rows.find(x=>x.type===type&&x.audience===audience&&x.discipline===discipline);
assert.deepEqual([by('group','adults','ski').min_age,by('group','adults','ski').max_age,by('group','adults','ski').n],[17,120,5]);
assert.deepEqual([by('group','kids','ski').min_age,by('group','kids','ski').max_age,by('group','kids','ski').n],[0,16,4]);
assert.deepEqual([by('group_toddler','kids','ski').min_age,by('group_toddler','kids','ski').max_age,by('group_toddler','kids','ski').n],[3,4,2]);
assert.deepEqual([by('group','mixed','snowboard').min_age,by('group','mixed','snowboard').max_age,by('group','mixed','snowboard').n],[0,16,2]);
assert.equal(by('private','mixed','ski').min_age,null);
assert.equal(by('private','mixed','snowboard').max_age,null);
await assert.rejects(db.exec(sql),/preimage drift/); // no second overwrite
await db.close();
db=await fixture();
await db.query(`UPDATE public.products SET min_age=5 WHERE id=$1`,[src.products.find(x=>x.type==='group').product_id]);
await assert.rejects(db.exec(sql),/preimage drift/);
const after=await db.query('SELECT count(*)::int AS n FROM public.products WHERE min_age IS NOT NULL');
assert.equal(after.rows[0].n,1); // atomically nothing else was changed
await db.close();
console.log('26/27 group ages: 5 adult exceptions, 6 ski youth, 2 snowboard youth; private unchanged; rerun and drift rejected');
