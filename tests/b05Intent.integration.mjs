// Real SQL tests for supabase/pending/staff_booking_finalize.sql (migration 0006):
// settlement/notes atomic with the core booking, fault injection + retry, and persistence of the
// ACTUAL browser payloads captured by the wizard acceptance run (optional files).
// Throwaway local PostgreSQL only: schema-only production baseline + installed pending SQL + synthetic data.
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres PGSSLMODE=disable \
//   [PRIVATE_PAYLOAD=/tmp/browser/payloads/private_later.json GROUP_PAYLOAD=/tmp/browser/payloads/group_lunch.json] \
//   bun tests/staffFinalize.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false, ...(process.env.BC_TEST_SOCKET === '/tmp' ? { host: '/tmp', port: Number(u.port) || 55432 } : {}) };
const dbName = `b05_intent_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [process.env.BC_TEST_SOCKET === '/tmp' ? `postgresql://${u.pathname}?host=/tmp&port=55432&user=postgres` : u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root)), ...(process.env.BC_TEST_SOCKET === '/tmp' ? ['-h', '/tmp'] : [])],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), S_OLD = id(9), P4 = id(2), PRIV = id(0xd1), LUNCH = id(5), ACTOR = id(0xbeef), HOTEL = id(0xb0);
const CUST = id(0xc1), CUST2 = id(0xc2), PA = id(0xa1), PB = id(0xa2), PX = id(0xa9);
const C_NOMP = id(0x150), C_SB = id(0x130), I1 = id(0xf001);
const WEEK = ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18'];
const XMAS = ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25'];
const TIERS4 = [150, 200, 245, 285, 320];
let keyN = 0; const key = () => `fin-key-${++keyN}-${Date.now()}`;
const gbook = (p) => sql`SELECT public.bc_2627_staff_group_book(${sql.json(p)}::jsonb, ${ACTOR}::uuid) r`.then((x) => x[0].r);
const pbook = (p) => sql`SELECT public.pa_create_booking_finalized(${sql.json(p)}::jsonb, ${ACTOR}::uuid) r`.then((x) => x[0].r);
const counts = async () => (await sql`SELECT (SELECT count(*)::int FROM tickets) tickets, (SELECT count(*)::int FROM ticket_items) items,
  (SELECT count(*)::int FROM payments) pay, (SELECT count(*)::int FROM ticket_comments) com, (SELECT count(*)::int FROM customer_participants) parts,
  (SELECT count(*)::int FROM group_course_enrollments) enr, (SELECT count(*)::int FROM private_appointments) appts`)[0];
const fin = (o = {}) => ({ payment_method: 'cash', settlement: 'paid_now', payment_due_date: null, internal_notes: 'Intern', instructor_notes: 'Für Lehrer', actor_name: 'office', ...o });

async function seedCourse(cid, name, { mp = null, discipline = 'ski' } = {}) {
  await sql`INSERT INTO group_courses(id,name,discipline,min_age,max_age,price_per_day,is_active,product_id,course_type,meeting_point,max_participants)
    VALUES (${cid},${name},${discipline},4,16,0,true,${P4},'weekly',${mp},2)`;
  for (const d of [...WEEK, ...XMAS]) for (const [a, b] of [['10:00', '12:00'], ['14:00', '16:00']])
    await sql`INSERT INTO group_course_instances(course_id,date,start_time,end_time,status,current_participants) VALUES (${cid},${d},${a},${b},'scheduled',0)`;
  await sql`INSERT INTO bc_2627_course_product_variants(course_id,product_id,eligible_day_counts) VALUES (${cid},${P4},${[1, 2, 3, 4, 5]})`;
}

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/pa_assign_later.sql',
    'supabase/pending/course_archive_delete.sql', 'supabase/pending/bc_2627_staff_group_booking.sql',
    'supabase/pending/bc_2627_staff_group_booking_v2.sql', 'supabase/pending/staff_booking_finalize.sql']) {
    const r = psqlFile(f); if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }
  // Pre-0007 bodies (compare with live readback before installing 0007).
  for (const x of await sql`SELECT proname, md5(prosrc) m FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('pa_create_booking','bc_2627_staff_group_book') ORDER BY 1`)
    results.push(`     pre-0007 md5 ${x.proname} ${x.m}`);
  { const r = psqlFile('supabase/pending/staff_guest_level.sql'); if (r.status !== 0) throw new Error(`psql 0007: ${r.stderr}`); }
  { const r = psqlFile('supabase/pending/group_lunch_full_day.sql'); if (r.status !== 0) throw new Error(`psql lunch: ${r.stderr}`); }
  for (const x of await sql`SELECT proname, md5(prosrc) m FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('pa_create_booking','bc_2627_staff_group_book','staff_guest_level_ok') ORDER BY 1`)
    results.push(`     0007 md5 ${x.proname} ${x.m}`);
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-05' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15'),('${S_OLD}','Winter 25/26','2025-12-01','2026-04-06');
    INSERT INTO products(id,name,type,price,season_id,is_active,duration_minutes) VALUES
      ('${P4}','26/27 Kinder Ganztag','group',0,'${S}',true,240),('${PRIV}','Privat 1h','private',0,'${S}',true,60),
      ('${LUNCH}','Mittagsbetreuung','lunch',30,'${S_OLD}',true,NULL);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ('${I1}','A','Eins','active','{ski}');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('08:00','17:00',80);
    INSERT INTO billing_partners(id,name) VALUES ('${HOTEL}','Hotel Synth');
    INSERT INTO customers(id,first_name,last_name,email,customer_number) VALUES ('${CUST}','Test','Kunde','t1@example.invalid','K-T1'),('${CUST2}','Andere','Kundin','t2@example.invalid','K-T2');
    INSERT INTO customer_participants(id,customer_id,first_name,birth_date) VALUES ('${PA}','${CUST}','Anna','2016-01-01'),('${PB}','${CUST}','Ben','2017-01-01'),('${PX}','${CUST2}','Fremd','2015-01-01');
  `);
  for (let d = 1; d <= 5; d++) {
    await sql`INSERT INTO product_price_tiers(product_id,day_count,cumulative_price) VALUES (${P4},${d},${TIERS4[d - 1]})`;
    await sql`INSERT INTO bc_product_tariff_sources(source_id,season_id,product_id,source_sha256,source_family,import_status,day_count,duration_minutes,persons_per_lesson,price_chf,source_payload)
      VALUES (${'src-4h-' + d},${S},${P4},'sha','Kinderkurs','draft',${d},240,1,${TIERS4[d - 1]},'{"group_capacity":2}')`;
  }
  await seedCourse(C_NOMP, 'Ski Ohne Treffpunkt');
  await seedCourse(C_SB, 'Snowboard Kids', { discipline: 'snowboard', mp: 'Täli' });
  const gline = (o) => ({ course_id: C_NOMP, product_id: P4, dates: WEEK, block: null, sport: 'ski', expected_unit_price: 320, meeting_point: 'malbipark', ...o });


  for(const f of ['supabase/pending/b04_delivery_compatibility.sql','supabase/pending/b05_office_confirmation_intent.sql']){const r=psqlFile(f);if(r.status!==0)throw new Error(r.stderr);}
  const create=(kind,p)=>sql`SELECT public.b05_office_create(${sql.json(p)}::jsonb,${ACTOR}::uuid,${kind}) r`.then(x=>x[0].r);
  const privatePayload=()=>({submission_key:key(),customer_id:CUST,product_id:PRIV,appointments:[{date:'2026-12-21',time_start:'10:00',time_end:'11:00',assign_later:true}],participants:[{guest_key:'b05-guest-'+key(),first_name:'Guest'+key(),birth_date:'2016-01-01'}],finalization:fin()});
  const groupPayload=()=>({submission_key:key(),customer_id:CUST,lines:[gline({guest:{guest_key:'b05-guest-'+key(),first_name:'Guest'+key(),birth_date:'2016-01-01'},dates:WEEK})],finalization:fin()});
  for(const kind of ['private','group'])for(const choice of [true,false])await t(kind+' atomic '+choice+' lost response/replay keeps one booking/people/payment/intent',async()=>{
   const p={...(kind==='private'?privatePayload():groupPayload()),confirmation_requested:choice};const before=await counts();
   const [a,b]=await Promise.all([create(kind,p),create(kind,{...p,confirmation_requested:!choice})]);assert.ok(a.ok&&b.ok,JSON.stringify([a,b]));assert.equal(a.ticket_id,b.ticket_id);
   const intents=await sql`SELECT requested FROM office_booking_confirmation_intents WHERE ticket_id=${a.ticket_id}`;assert.equal(intents.length,1);
   const first=a.replayed?b:a;assert.equal(intents[0].requested,first.confirmation_requested);
   const after=await counts();assert.equal(after.tickets-before.tickets,1);assert.equal(after.parts-before.parts,1);assert.equal(after.pay-before.pay,1);
   const replay=await create(kind,p);assert.equal(replay.ticket_id,a.ticket_id);assert.equal(replay.confirmation_requested,intents[0].requested);assert.deepEqual(await counts(),after);
  });
  await t('intent insert failure rolls back canonical booking, people and payment',async()=>{
   await sql.unsafe(`CREATE FUNCTION b05_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intent fault'; END $$; CREATE TRIGGER b05_fault BEFORE INSERT ON office_booking_confirmation_intents FOR EACH ROW EXECUTE FUNCTION b05_fault()`);
   const before=await counts();try{await assert.rejects(create('private',{...privatePayload(),confirmation_requested:true}),/intent fault/);assert.deepEqual(await counts(),before);}finally{await sql.unsafe('DROP TRIGGER b05_fault ON office_booking_confirmation_intents; DROP FUNCTION b05_fault()');}
  });
  await t('old create/replay not backfilled',async()=>{const p=privatePayload();const r=await pbook(p);assert.ok(r.ok);const replay=await create('private',{...p,confirmation_requested:true});assert.equal(replay.confirmation_requested,null);assert.equal((await sql`SELECT * FROM office_booking_confirmation_intents WHERE ticket_id=${r.ticket_id}`).length,0);});
  await t('service-only intent/rpc grants and invalid choice',async()=>{
   for(const role of ['anon','authenticated']){assert.equal((await sql`SELECT has_table_privilege(${role},'office_booking_confirmation_intents','SELECT') a,has_function_privilege(${role},'b05_office_create(jsonb,uuid,text)','EXECUTE') b`)[0].a,false);assert.equal((await sql`SELECT has_function_privilege(${role},'b05_office_create(jsonb,uuid,text)','EXECUTE') b`)[0].b,false);}
   const before=await counts();const r=await create('private',{...privatePayload(),confirmation_requested:'true'});assert.equal(r.error,'invalid');assert.deepEqual(await counts(),before);
  });
}finally{await sql.end();await admin.unsafe(`DROP DATABASE ${dbName} WITH (FORCE)`);await admin.end();}
console.log(results.join('\n'));console.log(`${passed} passed / ${results.filter(x=>x.startsWith('FAIL')).length} failed`);if(results.some(x=>x.startsWith('FAIL')))process.exitCode=1;
