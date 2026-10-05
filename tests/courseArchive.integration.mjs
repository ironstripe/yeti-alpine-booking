// Real SQL tests for supabase/pending/course_archive_delete.sql (course archive + guarded delete).
// Throwaway local PostgreSQL only: schema-only production baseline + pending SQL + synthetic data.
//   COURSE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres PGSSLMODE=disable bun tests/courseArchive.integration.mjs
import postgres from 'postgres';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const adminUrl = process.env.COURSE_TEST_DATABASE_URL ?? process.env.BC_TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/postgres';
const u = new URL(adminUrl);
if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Refusing non-local database');
const opts = { onnotice: () => {}, ssl: false };
const dbName = `course_archive_${Date.now()}`;
const admin = postgres(adminUrl, { ...opts, max: 1 });
await admin.unsafe(`CREATE DATABASE ${dbName}`);
await admin.unsafe(`ALTER DATABASE ${dbName} SET search_path = public, extensions`);
u.pathname = `/${dbName}`;
const sql = postgres(u.toString(), { ...opts, max: 10 });
const root = new URL('../', import.meta.url);

let passed = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); passed++; results.push(`ok   ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), PROD = id(2), PROD2 = id(3), ACTOR = id(0xbeef), CUST = id(0xc1), PART = id(0xa1);
const SRC = id(0x100), BOOKED = id(0x200), UNUSED = id(0x300), RACE = id(0x400);

// Snapshot of every row that could hang off a course (IDs + content).
const snapshot = async (c) => (await sql.unsafe(`SELECT
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM group_course_instances x WHERE course_id=$1) inst,
  (SELECT count(*)::int FROM group_course_instances WHERE course_id=$1) n_inst,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM training_course_dates x WHERE training_id=$1) dates,
  (SELECT count(*)::int FROM training_course_dates WHERE training_id=$1) n_dates,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM group_course_schedules x WHERE course_id=$1) sched,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM training_groups x WHERE course_id=$1) tg,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.source_key), '')) FROM bc_2627_course_period_sources x WHERE course_id=$1) src,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.product_id), '')) FROM bc_2627_course_product_variants x WHERE course_id=$1) var,
  (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '|' ORDER BY e.id), '')) FROM group_course_enrollments e JOIN group_course_instances i ON i.id=e.instance_id WHERE i.course_id=$1) enr,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM ticket_items x) items,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM tickets x) tickets,
  (SELECT jsonb_build_object('id',id,'name',name,'product_id',product_id,'price_per_day',price_per_day,'skill_level_id',skill_level_id) FROM group_courses WHERE id=$1) course`, [c]))[0];

async function seedCourse(cid, name, { source = false } = {}) {
  await sql.unsafe(`
    INSERT INTO group_courses(id,name,discipline,min_age,max_age,price_per_day,is_active,product_id,course_type,period_start_date,period_end_date)
      VALUES ('${cid}','${name}','ski',16,99,100,false,'${PROD}','saturday_course','2027-01-02','2027-03-06');
    INSERT INTO group_course_schedules(course_id,day_of_week,start_time,end_time,is_active)
      VALUES ('${cid}',6,'10:00','12:00',true),('${cid}',6,'13:00','15:00',true);
    INSERT INTO training_course_dates(training_id,date,is_cancelled)
      SELECT '${cid}', d::date, false FROM generate_series('2027-01-02'::date,'2027-03-06'::date,'7 days') d;
    INSERT INTO group_course_instances(course_id,date,start_time,end_time)
      SELECT '${cid}', d::date, s, e FROM generate_series('2027-01-02'::date,'2027-03-06'::date,'7 days') d,
        (VALUES ('10:00'::time,'12:00'::time),('13:00'::time,'15:00'::time)) v(s,e);
  `);
  if (source) {
    const tg = (await sql`INSERT INTO training_groups(course_id,week_start) VALUES (${cid},'2026-12-28') RETURNING id`)[0].id;
    await sql`INSERT INTO bc_2627_course_period_sources(source_key,course_id,training_group_id,source_sha256,tariff_source_ids,teaching_dates,eligible_variants)
      VALUES (${cid + '-a'},${cid},${tg},'sha','{t1}','{2027-01-02}','[]'),(${cid + '-b'},${cid},${tg},'sha','{t2}','{2027-01-09}','[]')`;
    await sql`INSERT INTO bc_2627_course_product_variants(course_id,product_id,eligible_day_counts) VALUES (${cid},${PROD},'{10}'),(${cid},${PROD2},'{5}')`;
  }
}

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql', 'supabase/pending/course_archive_delete.sql']) {
    const r = spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL(f, root))],
      { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });
    if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,price,season_id,is_active) VALUES ('${PROD}','Samstag Erw 10x','group',500,'${S}',false),('${PROD2}','Samstag Erw 5x','group',300,'${S}',false);
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES ('${PART}','${CUST}','Eva','Synth','1980-01-01');
  `);
  await seedCourse(SRC, '26/27 Samstag Ski Erwachsene Anfänger (synth)', { source: true });
  await seedCourse(BOOKED, 'Synth gebucht');
  await seedCourse(UNUSED, 'Synth ungenutzt');
  await seedCourse(RACE, 'Synth race');
  // Booked + billed variant
  const ticket = (await sql`INSERT INTO tickets(ticket_number,customer_id,total_amount) VALUES ('T-SYN-1',${CUST},500) RETURNING id`)[0].id;
  const item = (await sql`INSERT INTO ticket_items(ticket_id,product_id,date,unit_price,participant_id) VALUES (${ticket},${PROD},'2027-01-02',500,${PART}) RETURNING id`)[0].id;
  const inst = (await sql`SELECT id FROM group_course_instances WHERE course_id=${BOOKED} ORDER BY date, start_time LIMIT 1`)[0].id;
  await sql`INSERT INTO group_course_enrollments(instance_id,ticket_item_id,participant_id) VALUES (${inst},${item},${PART})`;

  const call = async (fn, ...args) => (await sql.unsafe(`SELECT public.${fn} r`, args))[0].r;

  await t('privileges: anon/authenticated cannot execute course_* helpers; service_role can', async () => {
    for (const f of ['course_dependencies(uuid)', 'course_set_archived(uuid, boolean, uuid)', 'course_delete_if_unused(uuid, uuid)']) {
      for (const role of ['anon', 'authenticated', 'public']) {
        const [{ ok }] = await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`;
        assert.equal(ok, false, `${role} ${f}`);
      }
      const [{ ok }] = await sql`SELECT has_function_privilege('service_role', ${'public.' + f}, 'EXECUTE') ok`;
      assert.equal(ok, true);
    }
  });

  await t('source FKs unchanged (NO ACTION), not loosened', async () => {
    const rows = await sql`SELECT conname, confdeltype FROM pg_constraint WHERE conname IN
      ('bc_2627_course_product_variants_course_id_fkey','bc_2627_course_period_sources_course_id_fkey')`;
    assert.equal(rows.length, 2);
    for (const r of rows) assert.equal(r.confdeltype, 'a');
  });

  await t('reported shape: source-linked course has 20 instances/10 dates/0 enrollments and 2+2 links', async () => {
    const d = await call('course_dependencies($1)', SRC);
    assert.deepEqual([d.instances, d.dates, d.enrollments, d.source_period_links, d.source_product_links], [20, 10, 0, 2, 2]);
  });

  await t('delete source-linked course → referenced, nothing changed', async () => {
    const before = await snapshot(SRC);
    const r = await call('course_delete_if_unused($1,$2)', SRC, ACTOR);
    assert.equal(r.error, 'referenced');
    assert.equal(r.dependencies.source_period_links, 2);
    assert.deepEqual(await snapshot(SRC), before);
  });

  await t('archive/restore source-linked course keeps every related row/ID; restore stays inactive', async () => {
    const before = await snapshot(SRC);
    assert.equal((await call('course_set_archived($1,true,$2)', SRC, ACTOR)).ok, true);
    let [c] = await sql`SELECT archived_at, archived_by, is_active FROM group_courses WHERE id=${SRC}`;
    assert.ok(c.archived_at); assert.equal(c.archived_by, ACTOR); assert.equal(c.is_active, false);
    assert.deepEqual(await snapshot(SRC), before);
    const again = (await sql`SELECT archived_at FROM group_courses WHERE id=${SRC}`)[0].archived_at;
    await call('course_set_archived($1,true,$2)', SRC, ACTOR); // idempotent
    assert.equal(+(await sql`SELECT archived_at FROM group_courses WHERE id=${SRC}`)[0].archived_at, +again);
    assert.equal((await call('course_set_archived($1,false,$2)', SRC, ACTOR)).ok, true);
    [c] = await sql`SELECT archived_at, is_active FROM group_courses WHERE id=${SRC}`;
    assert.equal(c.archived_at, null); assert.equal(c.is_active, false);
    assert.deepEqual(await snapshot(SRC), before);
  });

  await t('restore never activates for sale even if course was active before archive', async () => {
    await sql`UPDATE group_courses SET is_active=true WHERE id=${UNUSED}`;
    await call('course_set_archived($1,true,$2)', UNUSED, ACTOR);
    await call('course_set_archived($1,false,$2)', UNUSED, ACTOR);
    assert.equal((await sql`SELECT is_active FROM group_courses WHERE id=${UNUSED}`)[0].is_active, false);
  });

  await t('booked/billed course: delete refused; archive/restore leaves enrollment, ticket and item unchanged', async () => {
    const before = await snapshot(BOOKED);
    const r = await call('course_delete_if_unused($1,$2)', BOOKED, ACTOR);
    assert.equal(r.error, 'referenced'); assert.equal(r.dependencies.enrollments, 1);
    await call('course_set_archived($1,true,$2)', BOOKED, ACTOR);
    await call('course_set_archived($1,false,$2)', BOOKED, ACTOR);
    assert.deepEqual(await snapshot(BOOKED), before);
  });

  await t('unknown course → not_found for archive and delete', async () => {
    assert.equal((await call('course_set_archived($1,true,$2)', id(0x999), ACTOR)).error, 'not_found');
    assert.equal((await call('course_delete_if_unused($1,$2)', id(0x999), ACTOR)).error, 'not_found');
  });

  await t('concurrent source link committed while delete waits → referenced, course kept', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    let inserted;
    const insertTx = sql.begin(async (tx) => {
      await tx`INSERT INTO bc_2627_course_product_variants(course_id,product_id,eligible_day_counts) VALUES (${RACE},${PROD},'{10}')`;
      inserted?.();
      await gate;
    });
    await new Promise((r) => { inserted = r; setTimeout(r, 500); });
    const del = call('course_delete_if_unused($1,$2)', RACE, ACTOR);
    await new Promise((r) => setTimeout(r, 400));
    release();
    await insertTx;
    const r = await del;
    assert.equal(r.error, 'referenced');
    assert.equal((await sql`SELECT count(*)::int n FROM group_courses WHERE id=${RACE}`)[0].n, 1);
  });

  await t('unused course: deleted with its empty generated instances/dates/schedules; second call not_found', async () => {
    const r = await call('course_delete_if_unused($1,$2)', UNUSED, ACTOR);
    assert.equal(r.ok, true); assert.equal(r.deleted, 1);
    const [n] = await sql`SELECT (SELECT count(*)::int FROM group_courses WHERE id=${UNUSED}) c,
      (SELECT count(*)::int FROM group_course_instances WHERE course_id=${UNUSED}) i,
      (SELECT count(*)::int FROM training_course_dates WHERE training_id=${UNUSED}) d`;
    assert.deepEqual([n.c, n.i, n.d], [0, 0, 0]);
    assert.equal((await call('course_delete_if_unused($1,$2)', UNUSED, ACTOR)).error, 'not_found');
  });

  await t('teacher-assigned instance blocks delete', async () => {
    const c = id(0x500);
    await seedCourse(c, 'Synth assigned');
    const ins = (await sql`INSERT INTO instructors(first_name,last_name,status,roles) VALUES ('A','B','active','{ski}') RETURNING id`)[0].id;
    await sql`UPDATE group_course_instances SET instructor_id=${ins} WHERE id=(SELECT id FROM group_course_instances WHERE course_id=${c} LIMIT 1)`;
    const r = await call('course_delete_if_unused($1,$2)', c, ACTOR);
    assert.equal(r.error, 'referenced'); assert.equal(r.dependencies.assigned_instances, 1);
  });

  await t('rollback script removes columns/functions cleanly', async () => {
    const r = spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', '-f', fileURLToPath(new URL('supabase/rollback/course_archive_delete_rollback.sql', root))],
      { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });
    assert.equal(r.status, 0, r.stderr);
    const [x] = await sql`SELECT (SELECT count(*)::int FROM information_schema.columns WHERE table_name='group_courses' AND column_name IN ('archived_at','archived_by')) c,
      (SELECT count(*)::int FROM pg_proc WHERE proname LIKE 'course\\_%') f`;
    assert.deepEqual([x.c, x.f], [0, 0]);
    assert.equal((await sql`SELECT count(*)::int n FROM bc_2627_course_period_sources WHERE course_id=${SRC}`)[0].n, 2);
  });
} finally {
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  if (passed !== results.length || results.length === 0) process.exit(1);
}
