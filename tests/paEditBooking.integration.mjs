// B03a real SQL tests for supabase/pending/pa_edit_booking.sql (edit existing canonical private bookings).
// Throwaway local PostgreSQL only: production schema baseline + pending SQL + synthetic data.
//   PA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres bun tests/paEditBooking.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.PA_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `pa_edit_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 5 });
const root = new URL('../', import.meta.url);

let passed = 0; const results = [];
async function t(name, fn) { try { await fn(); passed++; results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); } }

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), PRIV = id(0xd1), CUST = id(0xc1), OTHER = id(0xc2), P1 = id(0xa1), P2 = id(0xa2), P3 = id(0xa3), PF = id(0xa9);
const I1 = id(0xf001), I2 = id(0xf002), ACTOR = id(0xbeef), TEACHER = id(0xbee2);
const sortIds = (a) => [...a].sort();

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/pa_assign_later.sql', 'supabase/pending/pa_edit_booking.sql']) {
    const r = spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL(f, root))],
      { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });
    if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }
  await sql.unsafe(`CREATE OR REPLACE FUNCTION public.pa_business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT DATE '2026-10-04' $$;`);
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid'),('${TEACHER}','t@example.invalid');
    INSERT INTO user_roles(user_id,role) VALUES ('${ACTOR}','office'),('${TEACHER}','teacher');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,duration_minutes,price,season_id,is_active) VALUES ('${PRIV}','Privat Ski','private',60,0,'${S}',true);
    INSERT INTO instructors(id,first_name,last_name,status,roles) VALUES ('${I1}','A','Eins','active','{ski}'),('${I2}','B','Zwei','active','{ski}');
    INSERT INTO private_lesson_rates(start_time,end_time,rate_per_hour) VALUES ('08:00','17:00',80);
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid'),('${OTHER}','Other','Kunde','o@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES
      ('${P1}','${CUST}','Lea','S','2016-02-02'),('${P2}','${CUST}','Tom','S','2014-03-03'),('${P3}','${CUST}','Mia','S','2012-03-03'),('${PF}','${OTHER}','X','Y','2015-01-01');
  `);
  let k = 0;
  const create = async (appts, people, more = {}) => {
    const r = (await sql`SELECT pa_create_booking(${sql.json({ submission_key: `pa-edit-${++k}-${Date.now()}`, customer_id: CUST, product_id: PRIV,
      appointments: appts, participants: people.map((p) => ({ participant_id: p })), ...more })}, ${ACTOR}) r`)[0].r;
    assert.equal(r.ok, true, JSON.stringify(r)); return r;
  };
  const slot = (date, ins = I1, s = '10:00', e = '11:00') => ({ date, time_start: s, time_end: e, instructor_id: ins });
  const edit = async (p, actor = ACTOR) => (await sql`SELECT pa_edit_booking(${sql.json(p)}, ${actor}) r`)[0].r;
  const state = async (ticket) => {
    const [tk] = await sql`SELECT total_amount::numeric tot, paid_amount::numeric paid, notes, participant_count FROM tickets WHERE id=${ticket}`;
    const ap = await sql`SELECT a.id, a.price::numeric price, a.meeting_point, ti.unit_price::numeric up, ti.discount_percent::numeric disc, ti.internal_notes, ti.instructor_notes,
      jsonb_build_object('date',a.date,'time_start',a.time_start::text,'time_end',a.time_end::text,'instructor_id',a.instructor_id,
        'meeting_point',a.meeting_point,'status',a.status,'line',jsonb_build_object('id',ti.id,'quantity',ti.quantity,
          'unit_price',ti.unit_price,'line_total',ti.line_total,'discount_percent',ti.discount_percent,'discount_reason',ti.discount_reason,
          'internal_notes',ti.internal_notes,'instructor_notes',ti.instructor_notes)) original,
      (SELECT array_agg(participant_id ORDER BY participant_id) FROM private_appointment_participants WHERE appointment_id=a.id) ppl
      FROM private_appointments a JOIN ticket_items ti ON ti.appointment_id=a.id WHERE a.ticket_id=${ticket} ORDER BY a.date`;
    const [{ h }] = await sql`SELECT count(*)::int h FROM ticket_history WHERE ticket_id=${ticket}`;
    const [{ q }] = await sql`SELECT count(*)::int q FROM notification_queue WHERE payload->>'ticket_id'=${ticket}`;
    return JSON.parse(JSON.stringify({ tk, ap, h, q }));
  };
  const expectAppt = (s, i) => ({ appointment_id: s.ap[i].id, expected_participant_ids: s.ap[i].ppl, expected_price: Number(s.ap[i].price), expected: s.ap[i].original });

  await t('review: per-lesson notes remain distinct and unrelated lesson unchanged', async () => {
    const b = await create([slot('2027-02-01'), slot('2027-02-02')], [P1, P2]);
    await sql`UPDATE ticket_items SET internal_notes=date::text, instructor_notes='teacher-'||date::text WHERE ticket_id=${b.ticket_id}`;
    const before = await state(b.ticket_id);
    const r = await edit({ mode:'apply', ticket_id:b.ticket_id, expected_total:Number(before.tk.tot), appointments:[{...expectAppt(before,0),internal_notes:'edited-one'}] });
    assert.equal(r.ok,true); const after=await state(b.ticket_id);
    assert.equal(after.ap[0].internal_notes,'edited-one'); assert.deepEqual(after.ap[1],before.ap[1]);
    assert.equal(after.ap[0].instructor_notes,before.ap[0].instructor_notes); assert.equal(after.tk.tot,before.tk.tot);
  });
  await t('review: stale notes, meeting point, same-price schedule and discount abort before any writes', async () => {
    const b=await create([slot('2027-02-03'),slot('2027-02-04')],[P1,P2]);
    for (const change of ["internal_notes='other editor'", "instructor_notes='other teacher note'", "meeting_point='other point'", "time_start='10:15',time_end='11:15'", `instructor_id='${I2}'`, "date='2027-02-05'", "discount_percent=5"]) {
      const before=await state(b.ticket_id);
      // Trigger mirrors scheduler values from the canonical appointment.
      if (/^(time_start|instructor_id|date|meeting_point)/.test(change)) await sql.unsafe(`UPDATE private_appointments SET ${change} WHERE id='${before.ap[1].id}'`);
      else await sql.unsafe(`UPDATE ticket_items SET ${change} WHERE appointment_id='${before.ap[1].id}'`);
      const changed=await state(b.ticket_id);
      const req={mode:'apply',ticket_id:b.ticket_id,expected_total:Number(before.tk.tot),appointments:[
        {...expectAppt(before,0),meeting_point:'first must not write'}, {...expectAppt(before,1),participant_ids:[P1,P3],acknowledged_price:100}],acknowledged_total:Number(before.tk.tot)};
      assert.equal((await edit(req)).error,'conflict',change); assert.deepEqual(await state(b.ticket_id),changed,change);
      assert.equal((await edit({...req,mode:'quote'})).error,'conflict',change+' quote');
    }
  });
  await t('review: stale customer note aborts without overwriting', async () => {
    const b=await create([slot('2027-02-06')],[P1]); const before=await state(b.ticket_id);
    await sql`UPDATE tickets SET notes='other editor' WHERE id=${b.ticket_id}`;
    const changed=await state(b.ticket_id);
    assert.equal((await edit({mode:'apply',ticket_id:b.ticket_id,expected_total:Number(before.tk.tot),expected_customer_notes:before.tk.notes,customer_notes:'my edit',appointments:[]})).error,'conflict');
    assert.deepEqual(await state(b.ticket_id),changed);
  });
  await t('review: same-price replacement requires ack, quoted/applied totals preserve unrelated discrepancy', async () => {
    const b=await create([slot('2027-02-07')],[P1,P2],{discount_percent:10,discount_reason:'keep'});
    await sql`UPDATE tickets SET total_amount=777 WHERE id=${b.ticket_id}`;
    const before=await state(b.ticket_id);
    const req={ticket_id:b.ticket_id,expected_total:777,appointments:[{...expectAppt(before,0),participant_ids:[P1,P3]}]};
    const q=await edit({...req,mode:'quote'}); assert.equal(Number(q.quote.new_total),777);
    assert.equal((await edit({...req,mode:'apply'})).error,'quote_changed'); assert.deepEqual(await state(b.ticket_id),before);
    const r=await edit({...req,mode:'apply',appointments:[{...req.appointments[0],acknowledged_price:100}],acknowledged_total:777});
    assert.equal(r.ok,true); assert.equal(Number(r.total),Number(q.quote.new_total));
    const after=await state(b.ticket_id); assert.equal(Number(after.tk.tot),777); assert.equal(Number(after.ap[0].disc),10); assert.deepEqual(after.ap[0].ppl,sortIds([P1,P3]));
  });

  await t('privileges: only service_role executes pa_edit_booking', async () => {
    for (const role of ['anon', 'authenticated']) {
      const [{ ok }] = await sql`SELECT has_function_privilege(${role}, 'public.pa_edit_booking(jsonb, uuid)', 'EXECUTE') ok`; assert.equal(ok, false, role);
    }
    const [{ ok }] = await sql`SELECT has_function_privilege('service_role', 'public.pa_edit_booking(jsonb, uuid)', 'EXECUTE') ok`; assert.equal(ok, true);
  });

  // Equivalent of T-2026-998114: one 1h lesson, two people, NULL line participant.
  const two = await create([slot('2026-12-26')], [P1, P2]);
  await t('fixture: 2 people → one line, NULL participant, server price 100', async () => {
    const s = await state(two.ticket_id);
    assert.equal(Number(s.tk.tot), 100); assert.deepEqual(s.ap[0].ppl, sortIds([P1, P2]));
    const [{ pid }] = await sql`SELECT participant_id pid FROM ticket_items WHERE ticket_id=${two.ticket_id}`; assert.equal(pid, null);
  });
  await t('unchanged quote/apply: changed=false, no writes, no history, no notifications', async () => {
    const before = await state(two.ticket_id);
    const q = await edit({ mode: 'quote', ticket_id: two.ticket_id, appointments: [expectAppt(before, 0)] });
    assert.equal(q.ok, true); assert.equal(q.quote.changed, false); assert.equal(Number(q.quote.new_total), 100);
    const r = await edit({ mode: 'apply', ticket_id: two.ticket_id, expected_total: 100, appointments: [{ ...expectAppt(before, 0), participant_ids: [P2, P1] }], internal_notes: before.ap[0].internal_notes ?? '' });
    assert.equal(r.ok, true); assert.equal(r.changed, false);
    assert.deepEqual(await state(two.ticket_id), before);
  });

  const disc = await create([slot('2026-12-27')], [P1, P2], { discount_percent: 10, discount_reason: 'Stammkunde' });
  await t('notes + meeting point only on discounted ticket: no repricing, total/discount kept', async () => {
    const before = await state(disc.ticket_id); assert.equal(Number(before.tk.tot), 90);
    const r = await edit({ mode: 'apply', ticket_id: disc.ticket_id, appointments: [{ ...expectAppt(before, 0), meeting_point: 'malbipark' }], internal_notes: 'neu', customer_notes: 'Kunde' });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.changed, true);
    const s = await state(disc.ticket_id);
    assert.equal(Number(s.tk.tot), 90); assert.equal(Number(s.ap[0].price), 100); assert.equal(Number(s.ap[0].disc), 10);
    assert.equal(s.ap[0].meeting_point, 'malbipark'); assert.equal(s.ap[0].internal_notes, 'neu'); assert.equal(s.tk.notes, 'Kunde');
    assert.equal(s.h, before.h + 1);
  });

  await t('add person: unacknowledged/wrong ack → quote_changed, nothing written; ack → reprice, discount kept', async () => {
    const before = await state(disc.ticket_id);
    const req = { ticket_id: disc.ticket_id, expected_total: 90, appointments: [{ ...expectAppt(before, 0), participant_ids: [P1, P2, P3] }] };
    const q = await edit({ ...req, mode: 'quote' });
    assert.equal(Number(q.quote.appointments[0].new_price), 120); assert.equal(Number(q.quote.new_total), 108);
    assert.equal((await edit({ ...req, mode: 'apply' })).error, 'quote_changed');
    const wrong = await edit({ ...req, mode: 'apply', appointments: [{ ...req.appointments[0], acknowledged_price: 110 }], acknowledged_total: 99 });
    assert.equal(wrong.error, 'quote_changed'); assert.equal(Number(wrong.quote.new_total), 108);
    assert.deepEqual(await state(disc.ticket_id), before);
    const ok = await edit({ ...req, mode: 'apply', appointments: [{ ...req.appointments[0], acknowledged_price: 120 }], acknowledged_total: 108 });
    assert.equal(ok.ok, true, JSON.stringify(ok));
    const s = await state(disc.ticket_id);
    assert.equal(Number(s.ap[0].price), 120); assert.equal(Number(s.ap[0].up), 120); assert.equal(Number(s.ap[0].disc), 10);
    assert.equal(Number(s.tk.tot), 108); assert.equal(s.ap[0].ppl.length, 3); assert.equal(s.tk.participant_count, 3);
  });

  await t('stale data or concurrent change aborts without writes', async () => {
    const before = await state(disc.ticket_id);
    const stale = { ticket_id: disc.ticket_id, mode: 'apply', appointments: [{ appointment_id: before.ap[0].id, expected_participant_ids: [P1, P2], expected_price: 100, participant_ids: [P1], acknowledged_price: 80 }], acknowledged_total: 72 };
    assert.equal((await edit(stale)).error, 'conflict');
    assert.equal((await edit({ ...stale, appointments: [{ ...expectAppt(before, 0), internal_notes: undefined }].map(({ internal_notes, ...a }) => a), expected_total: 1, internal_notes: 'x' })).error, 'conflict');
    assert.deepEqual(await state(disc.ticket_id), before);
  });

  await t('remove person reprices down (3 → 1)', async () => {
    const before = await state(disc.ticket_id);
    const r = await edit({ mode: 'apply', ticket_id: disc.ticket_id, appointments: [{ ...expectAppt(before, 0), participant_ids: [P1], acknowledged_price: 80 }], acknowledged_total: 72 });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(Number((await state(disc.ticket_id)).tk.tot), 72);
  });

  const multi = await create([slot('2026-12-28', I1), slot('2026-12-29', I2, '13:00', '15:00')], [P1, P2]);
  await t('multiday: only the edited appointment changes; other price/people untouched', async () => {
    const before = await state(multi.ticket_id);
    assert.deepEqual(before.ap.map((a) => Number(a.price)), [100, 200]);
    const r = await edit({ mode: 'apply', ticket_id: multi.ticket_id, appointments: [{ ...expectAppt(before, 1), participant_ids: [P1], acknowledged_price: 160 }], acknowledged_total: 260 });
    assert.equal(r.ok, true, JSON.stringify(r));
    const s = await state(multi.ticket_id);
    assert.deepEqual(s.ap.map((a) => Number(a.price)), [100, 160]); assert.deepEqual(s.ap[0].ppl, before.ap[0].ppl); assert.deepEqual(s.ap[1].ppl, [P1]);
    assert.equal(Number(s.tk.tot), 260);
  });

  await t('failing second appointment (foreign participant) rolls back the first', async () => {
    const before = await state(multi.ticket_id);
    const r = await edit({ mode: 'apply', ticket_id: multi.ticket_id, appointments: [
      { ...expectAppt(before, 0), participant_ids: [P1, P2, P3], acknowledged_price: 120 },
      { ...expectAppt(before, 1), participant_ids: [P1, PF], acknowledged_price: 200 }], acknowledged_total: 320 });
    assert.equal(r.error, 'invalid'); assert.equal(r.field, 'participants');
    assert.deepEqual(await state(multi.ticket_id), before);
  });

  await t('ownership/role errors: teacher forbidden, other ticket appointment not_found, unknown ticket not_found', async () => {
    const s = await state(multi.ticket_id);
    assert.equal((await edit({ mode: 'quote', ticket_id: multi.ticket_id, appointments: [] }, TEACHER)).error, 'forbidden');
    assert.equal((await edit({ mode: 'quote', ticket_id: two.ticket_id, appointments: [expectAppt(s, 0)] })).error, 'not_found');
    assert.equal((await edit({ mode: 'quote', ticket_id: id(0x999), appointments: [] })).error, 'not_found');
  });

  await t('paid, then issued invoice: unchanged save no-op; participant change protected; notes still allowed', async () => {
    await sql`UPDATE tickets SET paid_amount=100 WHERE id=${two.ticket_id}`;
    await sql`INSERT INTO invoices(ticket_id, invoice_number, subtotal, total, qr_reference, due_date, status, issued_at)
              VALUES (${two.ticket_id}, 'R-SYN-1', 100, 100, 'QR-SYN-1', '2026-12-01', 'issued', now())`;
    const before = await state(two.ticket_id);
    const noop = await edit({ mode: 'apply', ticket_id: two.ticket_id, appointments: [expectAppt(before, 0)] });
    assert.equal(noop.changed, false); assert.deepEqual(await state(two.ticket_id), before);
    const r = await edit({ mode: 'apply', ticket_id: two.ticket_id, appointments: [{ ...expectAppt(before, 0), participant_ids: [P1], acknowledged_price: 80 }], acknowledged_total: 80 });
    assert.equal(r.error, 'protected'); assert.deepEqual(r.excluded[0].reasons, ['invoiced']);
    assert.equal((await edit({ mode: 'apply', ticket_id: two.ticket_id, appointments: [{ ...expectAppt(before, 0), meeting_point: 'malbipark' }] })).error, 'protected');
    assert.deepEqual(await state(two.ticket_id), before);
    const n = await edit({ mode: 'apply', ticket_id: two.ticket_id, appointments: [], instructor_notes: 'Helm' });
    assert.equal(n.ok, true); const s = await state(two.ticket_id);
    assert.equal(Number(s.tk.tot), 100); assert.equal(Number(s.tk.paid), 100); assert.equal(Number(s.ap[0].price), 100);
  });
} finally {
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  await sql.end(); await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`); await admin.end();
  if (passed !== results.length || results.length === 0) process.exitCode = 1;
}
