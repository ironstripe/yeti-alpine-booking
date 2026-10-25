// Rollback rehearsal (local only, never live): full pending chain incl. B07a installed, then
// b07a_office_multi_create_rollback.sql and pa_tariff_l1_rollback.sql executed as written.
//   BC_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/paTariffL1Rollback.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const adminUrl = process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `l1_rb_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 4 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });
const CHAIN = ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql',
  ...readdirSync(fileURLToPath(new URL('drizzle/migrations/', root))).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort().map((f) => `drizzle/migrations/${f}`),
  'supabase/pending/b04_delivery_compatibility.sql', 'supabase/pending/b06_invoice_delivery.sql', 'supabase/pending/b11_created_total_event.sql',
  'supabase/pending/participant_birth_date_guard.sql', 'supabase/pending/group_lunch_full_day.sql', 'supabase/pending/group_lunch_season.sql',
  'supabase/pending/pa_edit_booking.sql', 'supabase/pending/b05_office_confirmation_intent.sql',
  'supabase/pending/product_private_tariff_rules.sql', 'supabase/pending/pa_tariff_l1.sql', 'supabase/pending/b07a_office_multi_create.sql'];

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), P = id(0xa0), LEG = id(0xa9), ACTOR = id(0xbeef), CUST = id(0xc1), ANNA = id(0xe1), BEN = id(0xe2);
const I = [1, 2, 3].map((n) => id(0xf000 + n));
const n2 = (x) => Math.round(Number(x) * 100) / 100;
const rule = (o) => ({ max_persons: 4, max_block_minutes: null, office_only: false, provenance: 'fixture', extra_person_chf: 40, ...o });

try {
  for (const f of CHAIN) { const res = psqlFile(f); if (res.status !== 0) throw new Error(`psql ${f}: ${res.stderr}`); }
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-25' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO user_roles(user_id, role) VALUES ('${ACTOR}','office');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES ('${P}','Privat Ski','private',120,0,'${S}',true);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ${I.map((x, n) => `('${x}','L${n}','Synth','active','{ski}')`).join(',')};
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES ('${ANNA}','${CUST}','Anna','Synth','2016-02-02'),('${BEN}','${CUST}','Ben','Synth','2016-03-03');
    INSERT INTO private_lesson_discount_rule(percent,threshold_minutes,provenance) VALUES (10,240,'fixture');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('09:00','17:00',80);
  `);
  await sql`SELECT save_product_private_tariff_rules(${P}::uuid, 0, ${sql.json([
    rule({ rule_kind: 'exact_block', window_start: '10:00', window_end: '12:00', price_chf: 190 }),
    rule({ rule_kind: 'exact_block', window_start: '12:00', window_end: '14:00', price_chf: 150 }),
    rule({ rule_kind: 'exact_block', window_start: '14:00', window_end: '16:00', price_chf: 190 })])}::jsonb, ${ACTOR}::uuid)`;
  const multi = async (p, mode) => (await sql`SELECT b07a_office_multi(${sql.json(p)}::jsonb, ${ACTOR}::uuid, ${mode}) r`)[0].r;
  const base = { customer_id: CUST, participants: [{ ref: 'a', participant_id: ANNA }],
    items: [{ kind: 'private', product_id: P, participants: ['a'], appointments: [{ date: '2026-12-14', time_start: '10:00', time_end: '12:00', instructor_id: I[0] }] }] };
  const q = await multi({ ...base, submission_key: 'rb-key-0001' }, 'quote');
  const c = await multi({ ...base, submission_key: 'rb-key-0001', confirmation_requested: false, acknowledged_quote_digest: q.quote.quote_digest }, 'create');
  if (!c.ok) throw new Error(JSON.stringify(c));
  const aid = c.appointment_ids[0];
  const mq = (await sql`SELECT pa_move_appointment(${aid}::uuid, '2026-12-14'::date, '12:00'::time, '14:00'::time, ${I[0]}::uuid, ${ACTOR}::uuid, NULL::jsonb) r`)[0].r;
  const m = (await sql`SELECT pa_move_appointment(${aid}::uuid, '2026-12-14'::date, '12:00'::time, '14:00'::time, ${I[0]}::uuid, ${ACTOR}::uuid, ${sql.json({ quote_digest: mq.quote.quote_digest })}::jsonb) r`)[0].r;
  if (!m.ok) throw new Error(JSON.stringify(m));
  const snap = async () => (await sql`SELECT jsonb_build_object('t',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM tickets x),
    'i',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM ticket_items x),'a',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM private_appointments x),
    'pr',(SELECT jsonb_agg(to_jsonb(x) ORDER BY appointment_id) FROM private_appointment_pricing x),
    'h',(SELECT count(*) FROM ticket_history))::text s`)[0].s;
  const before = await snap();

  await t('L1 rollback refuses to run while B07a is installed (nothing changed)', async () => {
    const r = psqlFile('supabase/rollback/pa_tariff_l1_rollback.sql');
    assert.notEqual(r.status, 0); assert.match(r.stderr, /B07a is installed/);
    assert.ok((await sql`SELECT to_regprocedure('public.pa_lock_days(uuid[],date[])') p`)[0].p);
  });
  await t('B07a rollback restores the single-item group body and drops the function/table; data unchanged', async () => {
    const r = psqlFile('supabase/rollback/b07a_office_multi_create_rollback.sql'); assert.equal(r.status, 0, r.stderr);
    const body = (await sql`SELECT pg_get_functiondef('public.bc_2627_staff_group_book(jsonb,uuid)'::regprocedure) b`)[0].b;
    assert.equal(body.includes('b07a.ticket'), false); assert.equal(body.includes('lunch_season'), true);
    assert.equal((await sql`SELECT to_regprocedure('public.b07a_office_multi(jsonb,uuid,text)') p`)[0].p, null);
    assert.equal((await sql`SELECT to_regclass('public.b07a_office_submissions') r`)[0].r, null);
    assert.equal(await snap(), before);
  });
  await t('L1 rollback (executable file) restores pre-L1 bodies, drops L1-only objects, keeps every row', async () => {
    const r = psqlFile('supabase/rollback/pa_tariff_l1_rollback.sql'); assert.equal(r.status, 0, r.stderr);
    for (const f of ['pa_lock_days(uuid[],date[])', 'pa_l1_requote(jsonb)', 'pa_l1_write_pricing(jsonb)', 'pa_l1_line_net(uuid)',
      'pa_move_appointment(uuid,date,time,time,uuid,uuid,jsonb)', 'pa_period_update(uuid,jsonb,uuid,jsonb)'])
      assert.equal((await sql`SELECT to_regprocedure(${'public.' + f}) p`)[0].p, null, f);
    const trg = (await sql`SELECT pg_get_triggerdef(oid) d FROM pg_trigger WHERE tgname = 'trg_pa_tariff_transition_parts'`)[0].d;
    assert.match(trg, /BEFORE INSERT OR DELETE ON/); assert.equal(/UPDATE/.test(trg), false);
    assert.equal(await snap(), before);
    for (const f of ['pa_move_appointment(uuid,date,time,time,uuid,uuid)', 'pa_period_update(uuid,jsonb,uuid)', 'pa_apply_slot(uuid,date,time,time,uuid)', 'pa_edit_booking(jsonb,uuid)'])
      for (const role of ['anon', 'authenticated']) assert.equal((await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`)[0].ok, false, `${role} ${f}`);
  });
  await t('after rollback: B07-P transition behaviour (teacher-only move ok, time move refused YT001, acknowledged price kept)', async () => {
    const tm = (await sql`SELECT pa_move_appointment(${aid}::uuid, '2026-12-14'::date, '12:00'::time, '14:00'::time, ${I[1]}::uuid, ${ACTOR}::uuid) r`)[0].r;
    assert.equal(tm.ok, true, JSON.stringify(tm));
    assert.equal(n2((await sql`SELECT unit_price FROM ticket_items WHERE appointment_id = ${aid}`)[0].unit_price), 150);
    await assert.rejects(sql`SELECT pa_move_appointment(${aid}::uuid, '2026-12-15'::date, '10:00'::time, '12:00'::time, ${I[1]}::uuid, ${ACTOR}::uuid)`, (e) => e.code === 'YT001');
  });
} finally {
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  if (passed !== results.length) process.exitCode = 1;
}
