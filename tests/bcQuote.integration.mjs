import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=new URL('../supabase/migrations/', import.meta.url);
const migration=fs.readFileSync(new URL('20261001194500_malbun_2627_product_drafts.sql',root),'utf8');
const source=JSON.parse(migration.match(/\$bc_json\$(\{.*?\})\$bc_json\$/s)?.[1] ?? 'null');
assert.equal(source.products.length,15);
assert.equal(source.tariffs.length,121);
const db=new PGlite();
await db.exec(`CREATE TABLE public.seasons(id uuid PRIMARY KEY, name text, start_date date,end_date date);
CREATE TABLE public.products(id uuid PRIMARY KEY,season_id uuid,type text,discipline text,duration_minutes int,pricing_type text);
CREATE TABLE public.bc_product_tariff_sources(source_id text PRIMARY KEY,product_id uuid,import_status text,source_family text,day_count int,duration_minutes int,persons_per_lesson int,price_chf numeric(10,2),source_payload jsonb);
CREATE TABLE public.product_price_tiers(product_id uuid,day_count int,cumulative_price numeric(10,2));
CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;
INSERT INTO public.seasons VALUES ('aaaaaaaa-0000-4000-8000-000000000001','Winter 26/27','2026-12-01','2027-04-15');`);
for(const p of source.products) await db.query('INSERT INTO public.products VALUES ($1,$2,$3,$4,$5,$6)',[
  p.product_id,'aaaaaaaa-0000-4000-8000-000000000001',p.type,p.discipline,p.duration_minutes,p.pricing_type]);
const keys=new Map(source.products.map(p=>[p.product_key,p.product_id]));
for(const t of source.tariffs) {
  const id=t.product_key?keys.get(t.product_key):null;
  await db.query('INSERT INTO public.bc_product_tariff_sources VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[
    t.source_id,id,t.status,t.family,t.day_count,t.duration_minutes,t.persons,t.amount,JSON.stringify({group_capacity:t.group_capacity})]);
  if(id && t.family!=='Privatkurs') await db.query('INSERT INTO public.product_price_tiers VALUES ($1,$2,$3)',[id,t.day_count,t.amount]);
}
const quoteSql=fs.readFileSync(new URL('20261002215000_bc_2627_quote_only.sql',root),'utf8');
await db.exec(quoteSql);
await db.exec(fs.readFileSync(new URL('20261003000000_bc_2627_quote_real_product_schema.sql',root),'utf8'));
async function quote(id,items,persons){const result=await db.query('SELECT public.quote_bc_2627_product($1,$2::jsonb,$3) AS q',[id,JSON.stringify(items),persons]);return result.rows[0].q;}
async function rejects(id,items,persons,substr){let err;try{await quote(id,items,persons)}catch(e){err=e}assert.ok(err,`expected rejection: ${substr}`);assert.match(err.message,new RegExp(substr,'i'))}
const day=(date,block='morning')=>({date,time_start:block==='morning'?'10:00':'14:00',time_end:block==='morning'?'12:00':'16:00'});
const series=['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06'];
let checked=0;
for(const t of source.tariffs.filter(x=>x.status==='draft')) {
  const id=keys.get(t.product_key);
  if(t.family==='Privatkurs'){
    const endHour=9+t.duration_minutes/60;
    const dates=[{date:'2026-12-08',time_start:'09:00',time_end:`${String(endHour).padStart(2,'0')}:00`}];
    const q=await quote(id,dates,t.persons);
    assert.equal(Number(q.total_amount),Number(t.amount),`source=${t.source_id}`);
    assert.deepEqual(q.source_tariff_ids,[t.source_id]);
  } else {
    const saturday=t.family==='Samstagkurs';
    const dates=Array.from({length:t.day_count},(_,i)=>saturday?series[i]:`2026-12-${String(7+i).padStart(2,'0')}`);
    const items=dates.flatMap(d=>t.duration_minutes===240?[day(d),day(d,'afternoon')]:[day(d)]);
    const q=await quote(id,items,1);
    assert.equal(Number(q.total_amount),Number(t.amount),`source=${t.source_id}`);
    assert.deepEqual(q.source_tariff_ids,[t.source_id]);
  }
  checked++;
}
assert.equal(checked,115);
const ski=keys.get('private:ski'),child=keys.get('weekday:ski:kids:120'),four=keys.get('weekday:ski:kids:240'),sat=keys.get('saturday:ski:kids:240');
assert.equal(Number((await quote(ski,[{date:'2026-12-08',time_start:'09:00',time_end:'11:00'}],2)).total_amount),210);
assert.equal(Number((await quote(four,[day('2026-12-08'),day('2026-12-08','afternoon')],2)).total_amount),300);
await rejects(child,[day('2026-12-08'),day('2026-12-09')],1,'Missing exact day tier');
await rejects(four,[day('2026-12-08')],1,'Wrong group day count');
await rejects(four,[day('2026-12-08'),day('2026-12-08')],1,'Missing or duplicate');
await rejects(sat,[day('2027-01-09'),day('2027-01-09','afternoon'),day('2027-02-20'),day('2027-02-20','afternoon')],1,'one of the two series');
await rejects(child,[day('2026-12-12')],1,'Mon-Fri week');
await rejects(ski,[{date:'2026-12-08',time_start:'09:00',time_end:'10:30'}],1,'Unsupported private duration');
await rejects(ski,[{date:'2026-12-08',time_start:'09:00',time_end:'11:00'}],6,'Invalid 26/27 quote input');
await db.query('UPDATE public.bc_product_tariff_sources SET source_payload=$2::jsonb WHERE product_id=$1',[child,JSON.stringify({group_capacity:1})]);
await rejects(child,[day('2026-12-08')],2,'source group capacity');
await db.close();
console.log(`PostgreSQL function verified: ${checked} source tariff rows + 10 boundaries; no YETI data changed`);
