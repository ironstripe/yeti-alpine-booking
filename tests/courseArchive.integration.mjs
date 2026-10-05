// Real SQL tests for supabase/pending/course_archive_delete.sql (course archive + protected delete).
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
const psqlFile = (f, single = false) => spawnSync('psql', [u.toString(), '-q', '-v', 'ON_ERROR_STOP=1', ...(single ? ['-1'] : []), '-f', fileURLToPath(new URL(f, root))],
  { encoding: 'utf8', env: { ...process.env, PGSSLMODE: 'disable' } });

let passed = 0;
const results = [];
async function t(name, fn) {
  try { await fn(); passed++; results.push(`ok   ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = id(1), PROD = id(2), PROD2 = id(3), ACTOR = id(0xbeef), CUST = id(0xc1), PART = id(0xa1);
const WIED = id(0x100), SAT_A = id(0x110), SAT_F = id(0x120), BOOKED = id(0x200), ARCH = id(0x300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every row that could hang off a course (IDs + content) plus shared billing/product rows.
const snapshot = async (c) => (await sql.unsafe(`SELECT
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM group_course_instances x WHERE course_id=$1) inst,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM training_course_dates x WHERE training_id=$1) dates,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM group_course_schedules x WHERE course_id=$1) sched,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM training_groups x WHERE course_id=$1) tg,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.source_key), '')) FROM bc_2627_course_period_sources x WHERE course_id=$1) src,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.product_id), '')) FROM bc_2627_course_product_variants x WHERE course_id=$1) var,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM group_course_enrollments x) enr,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM ticket_items x) items,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM customer_participants x) parts,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM products x) prods,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), '')) FROM course_deletion_log x) log,
  (SELECT to_jsonb(g) - 'updated_at' FROM group_courses g WHERE id=$1) course`, [c]))[0];

// Imported shape: `weeks` source periods (one training group each), `blocks` instances per teaching date.
async function seedCourse(cid, name, { weeks = 0, days = 5, blocks = 1, variants = [], saturdayDates = 0, plainInstances = 0 } = {}) {
  await sql`INSERT INTO group_courses(id,name,discipline,min_age,max_age,price_per_day,is_active,product_id,course_type,period_start_date,period_end_date)
    VALUES (${cid},${name},'ski',17,99,0,false,${PROD},'weekly','2026-12-01','2027-04-15')`;
  await sql`INSERT INTO group_course_schedules(course_id,day_of_week,start_time,end_time,is_active) VALUES (${cid},1,'10:00','12:00',true)`;
  for (let w = 0; w < weeks; w++) {
    const ws = new Date(Date.UTC(2026, 10, 30 + 7 * w)).toISOString().slice(0, 10);
    const tg = (await sql`INSERT INTO training_groups(course_id,week_start,status) VALUES (${cid},${ws},'active') RETURNING id`)[0].id;
    await sql`INSERT INTO bc_2627_course_period_sources(source_key,course_id,training_group_id,source_sha256,tariff_source_ids,teaching_dates,eligible_variants)
      VALUES (${cid + ':' + w},${cid},${tg},'sha','{5255}','{}','{}')`;
    await sql.unsafe(`INSERT INTO group_course_instances(course_id,date,start_time,end_time,status,current_participants)
      SELECT $1, ($2::date + d), ('10:00'::time + make_interval(hours => 3*b)), ('12:00'::time + make_interval(hours => 3*b)), 'scheduled', 0
      FROM generate_series(1,$3) d, generate_series(0,$4-1) b`, [cid, ws, days, blocks]);
  }
  if (plainInstances) await sql.unsafe(`INSERT INTO group_course_instances(course_id,date,start_time,end_time)
    SELECT $1, '2027-01-02'::date + 7*g, '10:00', '12:00' FROM generate_series(0,$2-1) g`, [cid, plainInstances]);
  if (saturdayDates) await sql.unsafe(`INSERT INTO training_course_dates(training_id,date,is_cancelled)
    SELECT $1, '2027-01-02'::date + 7*g, false FROM generate_series(0,$2-1) g`, [cid, saturdayDates]);
  for (const [p, dc] of variants) await sql`INSERT INTO bc_2627_course_product_variants(course_id,product_id,eligible_day_counts) VALUES (${cid},${p},${dc})`;
}
const firstInstance = async (c) => (await sql`SELECT id FROM group_course_instances WHERE course_id=${c} ORDER BY date,start_time LIMIT 1`)[0].id;
const exists = async (c) => (await sql`SELECT count(*)::int n FROM group_courses WHERE id=${c}`)[0].n === 1;

try {
  for (const f of ['tests/sql/baseline_prelude.sql', 'tests/sql/production_schema_baseline.sql']) {
    const r = psqlFile(f); if (r.status !== 0) throw new Error(`psql ${f}: ${r.stderr}`);
  }
  { const r = psqlFile('supabase/pending/course_archive_delete.sql', true); if (r.status !== 0) throw new Error(`pending: ${r.stderr}`); }
  await sql.unsafe(`
    INSERT INTO auth.users(id,email) VALUES ('${ACTOR}','office@example.invalid');
    INSERT INTO seasons(id,name,start_date,end_date) VALUES ('${S}','Winter 26/27','2026-12-01','2027-04-15');
    INSERT INTO products(id,name,type,price,season_id,is_active) VALUES ('${PROD}','Erw 1 Tag','group',100,'${S}',false),('${PROD2}','Erw 5 Tage','group',400,'${S}',false);
    INSERT INTO customers(id,last_name,first_name,email) VALUES ('${CUST}','Synth','Kunde','k@example.invalid');
    INSERT INTO customer_participants(id,customer_id,first_name,last_name,birth_date) VALUES ('${PART}','${CUST}','Eva','Synth','1980-01-01');
  `);
  // 26/27 Ski Erwachsene Wiedereinsteiger shape: 20 periods, 1 product variant, 98 instances.
  await seedCourse(WIED, '26/27 Ski Erwachsene Wiedereinsteiger (synth)', { weeks: 20, days: 5, blocks: 1, variants: [[PROD, '{1}']] });
  await sql`DELETE FROM group_course_instances WHERE id IN (SELECT id FROM group_course_instances WHERE course_id=${WIED} ORDER BY date DESC LIMIT 2)`;
  // Saturday adult shape: 20 instances, 10 dates, 2 period + 2 product links.
  for (const [c, n] of [[SAT_A, 'Anfänger'], [SAT_F, 'Fortgeschritten']]) {
    await seedCourse(c, `26/27 Samstag Ski Erwachsene ${n} (synth)`, { weeks: 2, days: 5, blocks: 2, variants: [[PROD, '{10}'], [PROD2, '{5}']], saturdayDates: 10 });
  }
  const call = async (fn, ...args) => (await sql.unsafe(`SELECT public.${fn} r`, args))[0].r;
  const del = (c) => call('course_delete_if_unused($1,$2)', c, ACTOR);
  const book = async (c, viaGroup = false) => {
    const ticket = (await sql`INSERT INTO tickets(ticket_number,customer_id,total_amount) VALUES (${'T-' + c.slice(-6) + Math.random()},${CUST},100) RETURNING id`)[0].id;
    const item = (await sql`INSERT INTO ticket_items(ticket_id,product_id,date,unit_price,participant_id) VALUES (${ticket},${PROD},'2026-12-01',100,${PART}) RETURNING id`)[0].id;
    const tg = viaGroup ? (await sql`SELECT id FROM training_groups WHERE course_id=${c} LIMIT 1`)[0]?.id ?? null : null;
    return { item, tg };
  };

  await t('privileges: course_* helpers and deletion log service_role only', async () => {
    for (const f of ['course_dependencies(uuid)', 'course_set_archived(uuid, boolean, uuid)', 'course_delete_if_unused(uuid, uuid)']) {
      for (const role of ['anon', 'authenticated', 'public']) {
        assert.equal((await sql`SELECT has_function_privilege(${role}, ${'public.' + f}, 'EXECUTE') ok`)[0].ok, false, `${role} ${f}`);
      }
      assert.equal((await sql`SELECT has_function_privilege('service_role', ${'public.' + f}, 'EXECUTE') ok`)[0].ok, true);
    }
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await sql`SELECT has_table_privilege(${role}, 'public.course_deletion_log', 'SELECT') ok`)[0].ok, false);
    }
  });

  await t('source FKs unchanged (NO ACTION), not loosened', async () => {
    const rows = await sql`SELECT confdeltype FROM pg_constraint WHERE conname IN
      ('bc_2627_course_product_variants_course_id_fkey','bc_2627_course_period_sources_course_id_fkey','bc_2627_course_period_sources_training_group_id_fkey')`;
    assert.equal(rows.length, 3); for (const r of rows) assert.equal(r.confdeltype, 'a');
  });

  await t('Wiedereinsteiger shape (98 instances, 20+1 source links) is deletable; owned rows removed, shared rows kept, audit written', async () => {
    const d = await call('course_dependencies($1)', WIED);
    assert.deepEqual([d.instances, d.source_period_links, d.source_product_links, d.groups, d.enrollments], [98, 20, 1, 20, 0]);
    const prodsBefore = (await snapshot(WIED)).prods;
    const r = await del(WIED);
    assert.equal(r.ok, true); assert.equal(r.deleted, 1); assert.equal(r.instances, 98);
    const [n] = await sql`SELECT (SELECT count(*)::int FROM group_course_instances WHERE course_id=${WIED}) i,
      (SELECT count(*)::int FROM training_groups WHERE course_id=${WIED}) g,
      (SELECT count(*)::int FROM group_course_schedules WHERE course_id=${WIED}) s,
      (SELECT count(*)::int FROM bc_2627_course_period_sources WHERE course_id=${WIED}) p,
      (SELECT count(*)::int FROM bc_2627_course_product_variants WHERE course_id=${WIED}) v`;
    assert.deepEqual([n.i, n.g, n.s, n.p, n.v], [0, 0, 0, 0, 0]);
    assert.equal(await exists(WIED), false);
    assert.equal((await snapshot(WIED)).prods, prodsBefore, 'shared products unchanged');
    const [log] = await sql`SELECT * FROM course_deletion_log WHERE course_id=${WIED}`;
    assert.equal(log.deleted_by, ACTOR); assert.match(log.course_name, /Wiedereinsteiger/);
    assert.equal(log.snapshot.source_period_links.length, 20); assert.equal(log.snapshot.source_product_links.length, 1);
    assert.equal(log.snapshot.course.id, WIED);
  });

  await t('duplicate retry after success → not_found, no second audit row', async () => {
    assert.equal((await del(WIED)).error, 'not_found');
    assert.equal((await sql`SELECT count(*)::int n FROM course_deletion_log WHERE course_id=${WIED}`)[0].n, 1);
  });

  await t('both Saturday shapes (20 instances, 10 dates, 2+2 links) delete successfully', async () => {
    for (const c of [SAT_A, SAT_F]) {
      const d = await call('course_dependencies($1)', c);
      assert.deepEqual([d.instances, d.dates, d.source_period_links, d.source_product_links], [20, 10, 2, 2]);
      assert.equal((await del(c)).ok, true); assert.equal(await exists(c), false);
    }
    assert.equal((await sql`SELECT count(*)::int n FROM products`)[0].n, 2);
  });

  // Blockers: each case on a fresh source-linked course; nothing may change.
  const blockerCases = [
    ['booked enrollment on instance', 'enrollments', async (c) => { const { item } = await book(c); await sql`INSERT INTO group_course_enrollments(instance_id,ticket_item_id,participant_id) VALUES (${await firstInstance(c)},${item},${PART})`; }],
    ['enrollment via training group', 'enrollments', async (c) => {
      const other = id(0x9001); if (!(await exists(other))) await seedCourse(other, 'Synth other', { plainInstances: 1 });
      const { item, tg } = await book(c, true);
      await sql`INSERT INTO group_course_enrollments(instance_id,ticket_item_id,participant_id,training_group_id) VALUES (${await firstInstance(other)},${item},${PART},${tg})`; }],
    ['teacher on instance', 'assigned_instances', async (c, ins) => { await sql`UPDATE group_course_instances SET instructor_id=${ins} WHERE id=${await firstInstance(c)}`; }],
    ['teacher on training group', 'assigned_groups', async (c, ins) => { await sql`UPDATE training_groups SET instructor_id=${ins} WHERE id=(SELECT id FROM training_groups WHERE course_id=${c} LIMIT 1)`; }],
    ['participant current course (SET NULL FK)', 'participant_course_refs', async (c) => { await sql`UPDATE customer_participants SET current_ski_training_id=${c} WHERE id=${PART}`; }],
    ['progression next_training_id (SET NULL FK)', 'next_course_refs', async (c) => {
      const p = id(0x9002); if (!(await exists(p))) await seedCourse(p, 'Synth progression'); await sql`UPDATE group_courses SET next_training_id=${c} WHERE id=${p}`; }],
    ['instructor notification history (SET NULL FK)', 'notification_refs', async (c, ins) => { await sql`INSERT INTO instructor_notification_queue(instructor_id,notification_type,group_instance_id) VALUES (${ins},'group_assigned',${await firstInstance(c)})`; }],
    ['event category', 'event_refs', async (c) => {
      const ev = (await sql`INSERT INTO events(event_date) VALUES ('2027-01-08') RETURNING id`)[0].id;
      await sql`INSERT INTO event_categories(event_id,name,category_type,training_id) VALUES (${ev},'x','training',${c})`; }],
  ];
  let ins;
  for (const [label, key, setup] of blockerCases) {
    await t(`blocked, unchanged: ${label}`, async () => {
      ins ??= (await sql`INSERT INTO instructors(first_name,last_name,status,roles) VALUES ('A','B','active','{ski}') RETURNING id`)[0].id;
      const c = id(0x7000 + blockerCases.findIndex((b) => b[0] === label));
      await seedCourse(c, `Synth ${label}`, { weeks: 2, days: 5, blocks: 2, variants: [[PROD, '{10}']], saturdayDates: 10 });
      await setup(c, ins);
      const before = await snapshot(c);
      const r = await del(c);
      assert.equal(r.error, 'referenced'); assert.ok(r.dependencies[key] > 0, `${key}=${r.dependencies[key]}`);
      assert.deepEqual(await snapshot(c), before);
      await sql`UPDATE customer_participants SET current_ski_training_id=NULL WHERE id=${PART}`;
    });
  }

  await t('race: enrollment on existing instance committed while delete waits → referenced, course kept', async () => {
    const c = id(0x8001);
    await seedCourse(c, 'Synth race A', { weeks: 2, days: 5, blocks: 2, variants: [[PROD, '{10}']] });
    const inst = await firstInstance(c); const { item } = await book(c);
    let release; const gate = new Promise((r) => { release = r; });
    let ready; const inserted = new Promise((r) => { ready = r; });
    const tx = sql.begin(async (q) => {
      await q`INSERT INTO group_course_enrollments(instance_id,ticket_item_id,participant_id) VALUES (${inst},${item},${PART})`;
      ready(); await gate;
    });
    await inserted;
    const pending = del(c);
    await sleep(400);
    release(); await tx;
    const r = await pending;
    assert.equal(r.error, 'referenced'); assert.equal(r.dependencies.enrollments, 1);
    assert.equal(await exists(c), true);
    assert.equal((await sql`SELECT count(*)::int n FROM group_course_instances WHERE course_id=${c}`)[0].n, 20);
  });

  await t('race: enrollment attempted while delete holds locks waits, then fails; no orphan', async () => {
    const c = id(0x8002);
    await seedCourse(c, 'Synth race B', { weeks: 2, days: 5, blocks: 2, variants: [[PROD, '{10}']] });
    const inst = await firstInstance(c); const { item } = await book(c);
    let release; const gate = new Promise((r) => { release = r; });
    let done; const deleted = new Promise((r) => { done = r; });
    const tx = sql.begin(async (q) => { const [{ r }] = await q`SELECT public.course_delete_if_unused(${c}, ${ACTOR}) r`; done(r); await gate; });
    assert.equal((await deleted).ok, true);
    const ins2 = sql`INSERT INTO group_course_enrollments(instance_id,ticket_item_id,participant_id) VALUES (${inst},${item},${PART})`.then(() => 'inserted', (e) => e.code);
    await sleep(400);
    release(); await tx;
    assert.equal(await ins2, '23503');
    assert.equal((await sql`SELECT count(*)::int n FROM group_course_enrollments WHERE instance_id=${inst}`)[0].n, 0);
  });

  await t('failure mid-delete rolls back everything (course, links, generated rows, audit)', async () => {
    const c = id(0x8003);
    await seedCourse(c, 'Synth rollback', { weeks: 2, days: 5, blocks: 2, variants: [[PROD, '{10}']], saturdayDates: 10 });
    const before = await snapshot(c);
    await sql.unsafe(`CREATE FUNCTION pg_temp_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic failure'; END$$;
      CREATE TRIGGER t_fail BEFORE DELETE ON group_course_schedules FOR EACH ROW EXECUTE FUNCTION pg_temp_fail();`);
    try { await assert.rejects(del(c), /synthetic failure/); }
    finally { await sql.unsafe(`DROP TRIGGER t_fail ON group_course_schedules; DROP FUNCTION pg_temp_fail();`); }
    assert.deepEqual(await snapshot(c), before);
  });

  await t('archive/restore keep every related row; restore never activates', async () => {
    await seedCourse(ARCH, 'Synth archive', { weeks: 2, days: 5, blocks: 2, variants: [[PROD, '{10}']] });
    await sql`UPDATE group_courses SET is_active=true WHERE id=${ARCH}`;
    const before = await snapshot(ARCH);
    assert.equal((await call('course_set_archived($1,true,$2)', ARCH, ACTOR)).ok, true);
    assert.equal((await call('course_set_archived($1,false,$2)', ARCH, ACTOR)).ok, true);
    const after = await snapshot(ARCH);
    assert.equal(after.course.is_active, false); assert.equal(after.course.archived_at, null);
    for (const k of ['inst', 'dates', 'sched', 'tg', 'src', 'var', 'enr', 'items']) assert.equal(after[k], before[k], k);
  });

  await t('booked course archive leaves enrollments/billing intact; unknown → not_found', async () => {
    await seedCourse(BOOKED, 'Synth booked', { plainInstances: 2 });
    const { item } = await book(BOOKED);
    await sql`INSERT INTO group_course_enrollments(instance_id,ticket_item_id,participant_id) VALUES (${await firstInstance(BOOKED)},${item},${PART})`;
    const before = await snapshot(BOOKED);
    await call('course_set_archived($1,true,$2)', BOOKED, ACTOR);
    const after = await snapshot(BOOKED);
    for (const k of ['inst', 'enr', 'items']) assert.equal(after[k], before[k], k);
    assert.equal((await del(id(0x999))).error, 'not_found');
  });

  await t('rollback script removes columns/functions, keeps deletion log', async () => {
    const r = psqlFile('supabase/rollback/course_archive_delete_rollback.sql');
    assert.equal(r.status, 0, r.stderr);
    const [x] = await sql`SELECT (SELECT count(*)::int FROM information_schema.columns WHERE table_name='group_courses' AND column_name IN ('archived_at','archived_by')) c,
      (SELECT count(*)::int FROM pg_proc WHERE proname LIKE 'course\\_%') f, (SELECT count(*)::int FROM course_deletion_log) l`;
    assert.deepEqual([x.c, x.f], [0, 0]); assert.ok(x.l >= 3);
  });
} finally {
  console.log(results.join('\n'));
  console.log(`${passed}/${results.length} passed`);
  await sql.end();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
  if (passed !== results.length || results.length === 0) process.exit(1);
}
