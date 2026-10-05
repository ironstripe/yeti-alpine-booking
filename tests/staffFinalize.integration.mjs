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
const opts = { onnotice: () => {}, ssl: false };
const dbName = `staff_finalize_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);
const psqlFile = (f) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', fileURLToPath(new URL(f, root))],
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

  await t('group: paid now (cash) -> metadata, one payment = server total, paid_amount, comments, all in the booking transaction', async () => {
    const r = await gbook({ submission_key: key(), customer_id: CUST, lines: [gline({ participant_id: PA, lunch_dates: ['2026-12-14'], expected_lunch_unit_price: 30 })], finalization: fin() });
    assert.ok(r.ok, JSON.stringify(r)); assert.equal(Number(r.total), 350);
    const tk = (await sql`SELECT * FROM tickets WHERE id=${r.ticket_id}`)[0];
    assert.equal(tk.payment_method, 'cash'); assert.equal(Number(tk.paid_amount), 350);
    const pay = await sql`SELECT * FROM payments WHERE ticket_id=${r.ticket_id}`; assert.equal(pay.length, 1); assert.equal(Number(pay[0].amount), 350); assert.equal(pay[0].created_by, ACTOR);
    const com = await sql`SELECT comment_type, content, created_by_name FROM ticket_comments WHERE ticket_id=${r.ticket_id} ORDER BY 1`;
    assert.deepEqual(com.map((c) => `${c.comment_type}:${c.content}:${c.created_by_name}`), ['instructor:Für Lehrer:office', 'internal:Intern:office']);
    assert.equal((await sql`SELECT count(*)::int n FROM ticket_history WHERE ticket_id=${r.ticket_id} AND event_type='PAYMENT_RECORDED'`)[0].n, 1);
  });
  await t('group: invoice/hotel -> no payment; hotel without valid partner rejected, nothing written', async () => {
    const r = await gbook({ submission_key: key(), customer_id: CUST, lines: [gline({ participant_id: PB })], finalization: fin({ payment_method: 'hotel', billing_partner_id: HOTEL, settlement: 'pay_later', payment_due_date: '2026-12-31' }) });
    assert.ok(r.ok, JSON.stringify(r));
    const tk = (await sql`SELECT * FROM tickets WHERE id=${r.ticket_id}`)[0];
    assert.equal(tk.billing_partner_id, HOTEL); assert.equal(Number(tk.paid_amount), 0);
    assert.equal(String(tk.payment_due_date.toISOString?.() ?? tk.payment_due_date).slice(0, 10), '2026-12-31');
    assert.equal((await sql`SELECT count(*)::int n FROM payments WHERE ticket_id=${r.ticket_id}`)[0].n, 0);
    const before = await counts();
    const bad = await gbook({ submission_key: key(), customer_id: CUST, lines: [gline({ guest: { guest_key: 'h1', first_name: 'H', birth_date: '2018-01-01' } })], finalization: fin({ payment_method: 'hotel', billing_partner_id: null }) });
    assert.equal(bad.field, 'billing_partner_id', JSON.stringify(bad)); assert.deepEqual(await counts(), before);
  });
  await t('group fault injection: payment insert fails -> whole booking rolled back; retry same key creates it once WITH payment; further retry replays', async () => {
    await sql.unsafe(`CREATE FUNCTION public.t_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected payment failure'; END $$;
      CREATE TRIGGER t_fault BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.t_fault();`);
    const sk = key();
    const p = { submission_key: sk, customer_id: CUST2, lines: [gline({ course_id: C_SB, sport: 'snowboard', meeting_point: undefined, dates: XMAS, guest: { guest_key: 'f1', first_name: 'Fa', birth_date: '2018-01-01' } })], finalization: fin({ payment_method: 'twint' }) };
    const before = await counts();
    await assert.rejects(gbook(p), /injected payment failure/);
    assert.deepEqual(await counts(), before, 'nothing persisted, no participant created');
    await sql.unsafe('DROP TRIGGER t_fault ON public.payments; DROP FUNCTION public.t_fault();');
    const r = await gbook(p); assert.ok(r.ok && !r.replayed, JSON.stringify(r));
    const r2 = await gbook(p); assert.equal(r2.replayed, true); assert.equal(r2.ticket_id, r.ticket_id);
    assert.equal((await sql`SELECT count(*)::int n FROM payments WHERE ticket_id=${r.ticket_id}`)[0].n, 1);
    assert.equal((await sql`SELECT count(*)::int n FROM customer_participants WHERE customer_id=${CUST2} AND first_name='Fa'`)[0].n, 1);
    assert.equal(Number((await sql`SELECT paid_amount FROM tickets WHERE id=${r.ticket_id}`)[0].paid_amount), 320);
  });

  const plater = (o = {}) => ({ submission_key: key(), customer_id: CUST, product_id: PRIV,
    appointments: [{ date: '2026-12-21', time_start: '10:00', time_end: '11:00', assign_later: true }, { date: '2026-12-21', time_start: '13:00', time_end: '14:00', assign_later: true }, { date: '2026-12-22', time_start: '10:00', time_end: '11:00', assign_later: true }],
    participants: [{ participant_id: PA }], ...o });
  await t('private LATER + paid now card: 3 canonical appointments, NULL teacher, payment = total, comments, one assign task', async () => {
    const r = await pbook({ ...plater(), finalization: fin({ payment_method: 'card' }) });
    assert.ok(r.ok, JSON.stringify(r)); assert.equal(Number(r.total), 240);
    const a = await sql`SELECT date::text d, time_start::text s, instructor_id FROM private_appointments WHERE ticket_id=${r.ticket_id} ORDER BY 1,2`;
    assert.deepEqual(a.map((x) => `${x.d} ${x.s} ${x.instructor_id}`), ['2026-12-21 10:00:00 null', '2026-12-21 13:00:00 null', '2026-12-22 10:00:00 null']);
    assert.equal(Number((await sql`SELECT paid_amount FROM tickets WHERE id=${r.ticket_id}`)[0].paid_amount), 240);
    assert.equal((await sql`SELECT count(*)::int n FROM payments WHERE ticket_id=${r.ticket_id}`)[0].n, 1);
    assert.equal((await sql`SELECT count(*)::int n FROM ticket_comments WHERE ticket_id=${r.ticket_id}`)[0].n, 2);
    assert.equal((await sql`SELECT count(*)::int n FROM action_tasks WHERE related_ticket_id=${r.ticket_id}`)[0].n, 1);
  });
  await t('private: error result after a guest was created (foreign participant) rolls back the guest too', async () => {
    const before = await counts();
    const r = await pbook(plater({ participants: [{ guest_key: 'guest-new-1', first_name: 'Neu', birth_date: '2017-05-05' }, { participant_id: PX }] }));
    assert.equal(r.error, 'invalid', JSON.stringify(r)); assert.equal(r.field, 'participants');
    assert.deepEqual(await counts(), before);
  });
  await t('private fault injection: payment fails -> nothing persisted; retry same key -> once with payment; replay keeps one payment', async () => {
    await sql.unsafe(`CREATE FUNCTION public.t_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected payment failure'; END $$;
      CREATE TRIGGER t_fault BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.t_fault();`);
    const p = { ...plater({ participants: [{ guest_key: 'guest-new-2', first_name: 'Retry', birth_date: '2017-05-05' }] }), finalization: fin() };
    const before = await counts();
    await assert.rejects(pbook(p), /injected payment failure/);
    assert.deepEqual(await counts(), before);
    await sql.unsafe('DROP TRIGGER t_fault ON public.payments; DROP FUNCTION public.t_fault();');
    const r = await pbook(p); assert.ok(r.ok && !r.replayed, JSON.stringify(r));
    const r2 = await pbook(p); assert.equal(r2.replayed, true);
    assert.equal((await sql`SELECT count(*)::int n FROM payments WHERE ticket_id=${r.ticket_id}`)[0].n, 1);
    assert.equal((await sql`SELECT count(*)::int n FROM customer_participants WHERE first_name='Retry'`)[0].n, 1);
  });
  await t('privileges: finalize + wrapper service_role only', async () => {
    for (const f of ['staff_booking_finalize(uuid, jsonb, uuid)', 'pa_create_booking_finalized(jsonb, uuid)', 'bc_2627_staff_group_book(jsonb, uuid)']) {
      for (const role of ['anon', 'authenticated']) assert.equal((await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`)[0].ok, false, `${role} ${f}`);
      assert.equal((await sql`SELECT has_function_privilege('service_role', ${'public.' + f}, 'EXECUTE') ok`)[0].ok, true);
    }
  });

  // ---- Actual browser payloads (captured from the real wizard; ids remapped onto synthetic rows) ----
  const remap = (raw, map) => { let s = raw; for (const [a, b] of Object.entries(map)) s = s.split(a).join(b); return JSON.parse(s); };
  const mapFile = process.env.PAYLOAD_IDMAP && existsSync(process.env.PAYLOAD_IDMAP) ? JSON.parse(readFileSync(process.env.PAYLOAD_IDMAP, 'utf8')) : null;
  if (process.env.PRIVATE_PAYLOAD && existsSync(process.env.PRIVATE_PAYLOAD)) {
    await t('ACTUAL browser private LATER payload persists (canonical appointments, assign_later, people, total)', async () => {
      const body = remap(readFileSync(process.env.PRIVATE_PAYLOAD, 'utf8'), mapFile?.private ?? {});
      const { action: _a, ...p } = body;
      if (p.finalization) p.finalization.actor_name = 'office';
      const r = await pbook(p); assert.ok(r.ok, JSON.stringify(r));
      const a = await sql`SELECT date::text d, time_start::text s, time_end::text e, instructor_id FROM private_appointments WHERE ticket_id=${r.ticket_id} ORDER BY 1,2`;
      assert.equal(a.length, p.appointments.length);
      p.appointments.forEach((x, i) => { assert.equal(a[i].d, x.date); assert.equal(a[i].s.slice(0, 5), x.time_start); assert.equal(a[i].instructor_id, x.instructor_id ?? null); });
      const persons = (await sql`SELECT count(DISTINCT participant_id)::int n FROM private_appointment_participants m JOIN private_appointments a ON a.id=m.appointment_id WHERE a.ticket_id=${r.ticket_id}`)[0].n;
      assert.equal(persons, p.participants.length);
      const tot = (await sql`SELECT sum(price)::numeric s FROM private_appointments WHERE ticket_id=${r.ticket_id}`)[0].s;
      assert.equal(Number(r.total), Number(tot));
      results.push(`     private payload: ${a.length} appointments, ${persons} people, total ${r.total}`);
    });
  }
  if (process.env.GROUP_PAYLOAD && existsSync(process.env.GROUP_PAYLOAD)) {
    await t('ACTUAL browser group+lunch payload persists (all blocks, meeting points, lunch days, total = summary)', async () => {
      const body = remap(readFileSync(process.env.GROUP_PAYLOAD, 'utf8'), mapFile?.group ?? {});
      const p = body.booking;
      if (p.finalization) p.finalization.actor_name = 'office';
      const r = await gbook(p); assert.ok(r.ok, JSON.stringify(r));
      const expected = p.lines.reduce((s, l) => s + l.expected_unit_price + (l.lunch_dates?.length ?? 0) * (l.expected_lunch_unit_price ?? 0), 0);
      assert.equal(Number(r.total), expected);
      for (const l of p.lines) {
        const pid = l.participant_id ?? r.participant_ids.find(Boolean);
        const enr = await sql`SELECT count(*)::int n FROM group_course_enrollments e JOIN ticket_items ti ON ti.id=e.ticket_item_id WHERE ti.ticket_id=${r.ticket_id} AND ti.item_type='group' AND (${l.participant_id ?? null}::uuid IS NULL OR e.participant_id=${l.participant_id ?? null}::uuid)`;
        assert.ok(enr[0].n >= l.dates.length * 2, `blocks for ${pid}`);
      }
      const items = await sql`SELECT item_type, meeting_point, date::text d FROM ticket_items WHERE ticket_id=${r.ticket_id} ORDER BY item_type, d`;
      const lunch = items.filter((i) => i.item_type === 'lunch').length;
      assert.equal(lunch, p.lines.reduce((s, l) => s + (l.lunch_dates?.length ?? 0), 0));
      for (const i of items.filter((x) => x.item_type === 'group')) assert.ok(i.meeting_point, 'meeting point stored');
      results.push(`     group payload: ${p.lines.length} lines, ${lunch} lunch days, total ${r.total}`);
    });
  }
} finally {
  console.log(results.join('\n'));
  console.log(`${passed}/${results.filter((r) => !r.startsWith('     ')).length} passed`);
  await sql.end(); await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin.end();
  process.exitCode = passed === results.filter((r) => !r.startsWith('     ')).length && passed > 0 ? 0 : 1;
}
