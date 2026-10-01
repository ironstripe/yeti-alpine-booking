-- Booking-Corner ledger test – run in the Lovable Cloud SQL editor (as postgres). FULLY ROLLED BACK.
-- GENERATED: do not edit supabase/tests/bc_import_ledger_test.sql by hand; edit the .template.sql and run
--   python3 supabase/tests/build_bc_import_ledger_test.py
-- The pending migration supabase/pending/bc_import_ledger.sql is embedded verbatim (re-runnable) inside the
-- transaction, so this works before AND after the migration is live; nothing persists either way.
-- Fixtures only: synthetic instructors (inactive), a synthetic run 'ledger_test', synthetic staging rows.
-- Real instructors/roles/links are only read for the unchanged-fingerprint check.
-- Identities are real current user_roles rows; missing identity → 'UNAVAILABLE' (report UNVERIFIED, not PASS).
-- Every role denial has a positive control on the same fixture rows. Pass: summary all_passed = true.

BEGIN;
CREATE SCHEMA ledger_test;
CREATE TABLE ledger_test.fp AS SELECT
  (SELECT md5(string_agg(t::text, '' ORDER BY id)) FROM public.instructors t) AS rows_hash,
  (SELECT count(*) FROM public.instructors) AS n_instructors,
  (SELECT md5(string_agg(user_id::text||role::text, ',' ORDER BY user_id, role)) FROM public.user_roles) AS roles_hash,
  (SELECT count(*) FROM public.user_roles) AS n_roles,
  (SELECT count(*) FROM public.instructors WHERE show_on_website AND status = 'active') AS team,
  (SELECT count(*) FROM public.instructor_source_links WHERE source_system = 'booking_corner') AS bc_links;

-- ===== embedded migration (verbatim) =====
--@@MIGRATION@@
-- ===== end embedded migration =====

CREATE TABLE ledger_test.who AS
WITH r AS (SELECT user_id, array_agg(role::text) rs FROM public.user_roles GROUP BY user_id)
SELECT
  (SELECT r.user_id FROM r JOIN public.instructor_user_links l USING (user_id) WHERE rs = ARRAY['teacher'] LIMIT 1) AS teacher,
  (SELECT user_id FROM r WHERE 'admin' = ANY(rs) AND NOT rs && ARRAY['office','super_admin'] LIMIT 1) AS admin,
  (SELECT user_id FROM r WHERE 'super_admin' = ANY(rs) LIMIT 1) AS sa_any,
  (SELECT user_id FROM r WHERE 'office' = ANY(rs) AND NOT 'super_admin' = ANY(rs) LIMIT 1) AS office_any;

CREATE TABLE ledger_test.fx AS SELECT gen_random_uuid() AS run, gen_random_uuid() AS t_upd, gen_random_uuid() AS t_fail,
  gen_random_uuid() AS t_chg, gen_random_uuid() AS t_other, gen_random_uuid() AS s_create, gen_random_uuid() AS s_upd,
  gen_random_uuid() AS s_fail, gen_random_uuid() AS s_chg;

INSERT INTO public.instructors(id, first_name, last_name, email, phone, city, hourly_rate, iban, bank_name, ahv_number,
                               show_on_website, avatar_url, status, notes, birth_date)
SELECT t_upd, 'LedgerU', 'Fixture', 'ledger-u@test.invalid', '+41 79 000 00 01', NULL, 31.5, 'CH00 TEST', 'TestBank', '756.0000.0000.00',
       true, 'https://example.invalid/a.jpg', 'inactive', NULL, NULL FROM ledger_test.fx
UNION ALL SELECT t_fail, 'LedgerF', 'Fixture', 'ledger-f@test.invalid', NULL, NULL, NULL, NULL, NULL, NULL, false, NULL, 'inactive', 'n', NULL FROM ledger_test.fx
UNION ALL SELECT t_chg, 'LedgerC', 'Fixture', 'ledger-c@test.invalid', '+41 79 000 00 03', NULL, NULL, NULL, NULL, NULL, false, NULL, 'inactive', NULL, NULL FROM ledger_test.fx
UNION ALL SELECT t_other, 'LedgerO', 'Fixture', 'ledger-o@test.invalid', '+41 79 000 00 04', 'Vaduz', 25, NULL, NULL, NULL, true, 'https://example.invalid/o.jpg', 'inactive', NULL, NULL FROM ledger_test.fx;
INSERT INTO public.instructor_photos(instructor_id, storage_path, origin, is_current, created_at)
  SELECT t_upd, 'ledger-test/u-manual.jpg', 'manual_upload', true, now() - interval '1 day' FROM ledger_test.fx
  UNION ALL SELECT t_fail, 'ledger-test/f-old-import.jpg', 'booking_import', true, now() - interval '2 days' FROM ledger_test.fx;  -- photo from an earlier run

CREATE TABLE ledger_test.pre AS SELECT i.id, to_jsonb(i) AS row FROM public.instructors i, ledger_test.fx f
  WHERE i.id IN (f.t_upd, f.t_fail, f.t_chg, f.t_other);

INSERT INTO public.instructor_import_runs(id, source_system, rollout, status, xlsx_sha256, created_by)
  SELECT run, 'ledger_test', 'test', 'applying', 'x', coalesce((SELECT sa_any FROM ledger_test.who), gen_random_uuid()) FROM ledger_test.fx;

CREATE FUNCTION ledger_test.payload(fn text, ln text, em text, ph text, city text, bd text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('first_name', fn, 'last_name', ln, 'email', em, 'phone', ph, 'birth_date', bd, 'gender', NULL,
    'street', NULL, 'zip', NULL, 'city', city, 'country', NULL, 'windows', '[{"from":"2026-12-01","until":"2027-04-15"}]'::jsonb) $$;
CREATE FUNCTION ledger_test.snap(i uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_object_agg(k, to_jsonb(x) ->> k) FROM public.instructors x,
    unnest(ARRAY['first_name','last_name','email','phone','birth_date','gender','street','zip','city','country']) k WHERE x.id = i $$;

INSERT INTO public.instructor_import_staging(id, run_id, source_id, classification, confidence, source_checksum, normalized,
    target_instructor_id, decision, apply_payload, review_snapshot, private_payload)
SELECT s_create, run, 'lt-create', 'create', 'high', 'c1', '{}', NULL, 'create',
       ledger_test.payload('LedgerNew', 'Create', 'ledger-new@test.invalid', '+41 79 000 00 09', NULL, NULL), NULL, '{"wage_raw":"synthetic"}' FROM ledger_test.fx
UNION ALL SELECT s_upd, run, 'lt-upd', 'review', 'high', 'c2', '{}', t_upd, 'link',
       ledger_test.payload(NULL, NULL, NULL, '+41 79 999 99 99', 'Malbun', NULL), ledger_test.snap(t_upd), '{}' FROM ledger_test.fx
UNION ALL SELECT s_fail, run, 'lt-fail', 'review', 'high', 'c3', '{}', t_fail, 'link',
       ledger_test.payload(NULL, NULL, NULL, '+41 79 999 99 98', NULL, 'not-a-date'), ledger_test.snap(t_fail), '{}' FROM ledger_test.fx
UNION ALL SELECT s_chg, run, 'lt-chg', 'review', 'high', 'c4', '{}', t_chg, 'link',
       ledger_test.payload(NULL, NULL, NULL, '+41 79 999 99 97', NULL, NULL), ledger_test.snap(t_chg), '{}' FROM ledger_test.fx;
-- target changes after review → must be refused, no snapshot
UPDATE public.instructors SET phone = '+41 79 111 11 11' WHERE id = (SELECT t_chg FROM ledger_test.fx);

CREATE TABLE ledger_test.res(n serial, test text, pass boolean, detail text);
CREATE FUNCTION ledger_test.ok(t text, b boolean, d text DEFAULT NULL) RETURNS void LANGUAGE sql AS
  $$ INSERT INTO ledger_test.res(test, pass, detail) VALUES (t, coalesce(b, false), d) $$;

-- ---------- run 1 ----------
CREATE TABLE ledger_test.r1 AS SELECT public.bc_apply_batch((SELECT run FROM ledger_test.fx), 50) AS r;
DO $$
DECLARE f record; r jsonb; L record; new_id uuid;
BEGIN
  SELECT * INTO f FROM ledger_test.fx; SELECT ledger_test.r1.r INTO r FROM ledger_test.r1;
  PERFORM ledger_test.ok('run1 counts applied=2 failed=1 conflict=1',
    (r->>'applied')::int = 2 AND (r->>'failed')::int = 1 AND (r->>'conflict')::int = 1, r::text);
  SELECT * INTO L FROM public.instructor_import_ledger WHERE run_id = f.run AND instructor_id = f.t_upd;
  PERFORM ledger_test.ok('update: exact pre-mutation row (incl. nulls/pay/website/avatar)',
    L.instructor_row = (SELECT row FROM ledger_test.pre WHERE id = f.t_upd));
  PERFORM ledger_test.ok('update: absent HR/link recorded explicitly, windows []',
    L.hr_private_present = false AND L.hr_private_row IS NULL AND L.source_link_present = false AND L.window_rows = '[]'::jsonb);
  PERFORM ledger_test.ok('update: photo metadata captured (1 manual, current)',
    jsonb_array_length(L.photo_rows) = 1 AND L.photo_rows->0->>'origin' = 'manual_upload' AND (L.photo_rows->0->>'is_current')::boolean);
  SELECT applied_instructor_id INTO new_id FROM public.instructor_import_staging WHERE id = f.s_create;
  PERFORM ledger_test.ok('create: provenance row with actual new UUID, kind=created, no image',
    EXISTS (SELECT 1 FROM public.instructor_import_ledger WHERE run_id = f.run AND instructor_id = new_id AND kind = 'created'
            AND source_id = 'lt-create' AND instructor_row IS NULL));
  PERFORM ledger_test.ok('failed row: batch failed, no ledger row',
    (SELECT batch_status FROM public.instructor_import_staging WHERE id = f.s_fail) = 'failed'
    AND NOT EXISTS (SELECT 1 FROM public.instructor_import_ledger WHERE run_id = f.run AND instructor_id = f.t_fail));
  PERFORM ledger_test.ok('changed target refused, no ledger row, target untouched',
    (SELECT error FROM public.instructor_import_staging WHERE id = f.s_chg) = 'target_changed_since_review'
    AND NOT EXISTS (SELECT 1 FROM public.instructor_import_ledger WHERE run_id = f.run AND instructor_id = f.t_chg)
    AND (SELECT phone FROM public.instructors WHERE id = f.t_chg) = '+41 79 111 11 11');
  PERFORM ledger_test.ok('update applied only import fields',
    (SELECT phone = '+41 79 999 99 99' AND city = 'Malbun' AND email = 'ledger-u@test.invalid' FROM public.instructors WHERE id = f.t_upd));
  PERFORM ledger_test.ok('pay/website/avatar/status/notes preserved on update target',
    (SELECT (to_jsonb(i) - ARRAY['phone','city','real_time_status']) = ((SELECT row FROM ledger_test.pre WHERE id = f.t_upd) - ARRAY['phone','city','real_time_status'])
     FROM public.instructors i WHERE i.id = f.t_upd));
  PERFORM ledger_test.ok('manual avatar still current',
    (SELECT is_current FROM public.instructor_photos WHERE instructor_id = f.t_upd AND origin = 'manual_upload'));
  PERFORM ledger_test.ok('unrelated profile byte-identical',
    (SELECT to_jsonb(i) FROM public.instructors i WHERE i.id = f.t_other) = (SELECT row FROM ledger_test.pre WHERE id = f.t_other));
END $$;

-- ---------- retry (run 2) ----------
-- s_upd: same-run retry AFTER a manual phone edit → must conflict and touch nothing.
-- s_create: same-run retry without edits → safe idempotent re-apply (no second UUID, row identical).
-- s_fail: formerly failed row (payload fixed) → succeeds with a clean first image.
CREATE TABLE ledger_test.cap AS SELECT instructor_id, captured_at, row_sha256 FROM public.instructor_import_ledger
  WHERE run_id = (SELECT run FROM ledger_test.fx);
CREATE TABLE ledger_test.post1 AS
  SELECT i.id, to_jsonb(i) AS row,
    (SELECT to_jsonb(h) FROM public.instructor_hr_private h WHERE h.instructor_id = i.id) AS hr,
    (SELECT to_jsonb(l) FROM public.instructor_source_links l WHERE l.instructor_id = i.id) AS link,
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.instructor_deployment_windows d WHERE d.instructor_id = i.id) AS win,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.instructor_photos p WHERE p.instructor_id = i.id) AS ph
  FROM public.instructors i, ledger_test.fx f
  WHERE i.id IN (f.t_upd, (SELECT applied_instructor_id FROM public.instructor_import_staging WHERE id = f.s_create));
UPDATE public.instructors SET phone = '+41 79 222 22 22' WHERE id = (SELECT t_upd FROM ledger_test.fx);  -- staff edit after run 1
UPDATE public.instructor_import_staging SET batch_status = 'failed'
  WHERE id IN ((SELECT s_upd FROM ledger_test.fx), (SELECT s_create FROM ledger_test.fx));
UPDATE public.instructor_import_staging SET apply_payload = jsonb_set(apply_payload, '{birth_date}', 'null')
  WHERE id = (SELECT s_fail FROM ledger_test.fx);
CREATE TABLE ledger_test.r2 AS SELECT public.bc_apply_batch((SELECT run FROM ledger_test.fx), 50) AS r;
DO $$
DECLARE f record; new_id uuid; r jsonb; p record;
BEGIN
  SELECT * INTO f FROM ledger_test.fx; SELECT ledger_test.r2.r INTO r FROM ledger_test.r2;
  SELECT applied_instructor_id INTO new_id FROM public.instructor_import_staging WHERE id = f.s_create;
  PERFORM ledger_test.ok('run2 counts applied=2 (create retry, formerly failed) conflict=1 (edited update)',
    (r->>'applied')::int = 2 AND (r->>'conflict')::int = 1 AND (r->>'failed')::int = 0, r::text);
  PERFORM ledger_test.ok('NEGATIVE same-run retry after manual edit → conflict edited_since_same_run_apply',
    (SELECT batch_status = 'conflict' AND error = 'edited_since_same_run_apply' FROM public.instructor_import_staging WHERE id = f.s_upd));
  SELECT * INTO p FROM ledger_test.post1 WHERE id = f.t_upd;
  PERFORM ledger_test.ok('NEGATIVE manual phone edit NOT overwritten, rest of row unchanged',
    (SELECT phone = '+41 79 222 22 22' AND (to_jsonb(i) - ARRAY['phone','real_time_status']) = (p.row - ARRAY['phone','real_time_status'])
     FROM public.instructors i WHERE i.id = f.t_upd));
  PERFORM ledger_test.ok('NEGATIVE conflicted retry left HR-private, source link, windows, photos untouched',
    (SELECT to_jsonb(h) FROM public.instructor_hr_private h WHERE h.instructor_id = f.t_upd) IS NOT DISTINCT FROM p.hr
    AND (SELECT to_jsonb(l) FROM public.instructor_source_links l WHERE l.instructor_id = f.t_upd) IS NOT DISTINCT FROM p.link
    AND (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.instructor_deployment_windows d WHERE d.instructor_id = f.t_upd) IS NOT DISTINCT FROM p.win
    AND (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.instructor_photos x WHERE x.instructor_id = f.t_upd) IS NOT DISTINCT FROM p.ph);
  SELECT * INTO p FROM ledger_test.post1 WHERE id = new_id;
  PERFORM ledger_test.ok('POSITIVE safe idempotent same-run retry: applied, row byte-identical, windows/photos same',
    (SELECT batch_status = 'applied' FROM public.instructor_import_staging WHERE id = f.s_create)
    AND (SELECT to_jsonb(i) FROM public.instructors i WHERE i.id = new_id) = p.row
    AND (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.instructor_deployment_windows d WHERE d.instructor_id = new_id) IS NOT DISTINCT FROM p.win
    AND (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.instructor_photos x WHERE x.instructor_id = new_id) IS NOT DISTINCT FROM p.ph
    AND (SELECT instructor_id FROM public.instructor_source_links WHERE source_system = 'ledger_test' AND source_id = 'lt-create') = new_id);
  PERFORM ledger_test.ok('retry: first image unchanged (captured_at + sha)',
    NOT EXISTS (SELECT 1 FROM ledger_test.cap c JOIN public.instructor_import_ledger l USING (instructor_id)
                WHERE l.run_id = f.run AND (l.captured_at, l.row_sha256) IS DISTINCT FROM (c.captured_at, c.row_sha256)));
  PERFORM ledger_test.ok('retry: update image still = original pre-row',
    (SELECT instructor_row FROM public.instructor_import_ledger WHERE run_id = f.run AND instructor_id = f.t_upd) = (SELECT row FROM ledger_test.pre WHERE id = f.t_upd));
  PERFORM ledger_test.ok('retry: no second create (one UUID, still kind=created)',
    (SELECT count(*) FROM public.instructors WHERE email = 'ledger-new@test.invalid') = 1
    AND (SELECT count(*) FROM public.instructor_import_ledger WHERE run_id = f.run AND instructor_id = new_id) = 1
    AND (SELECT kind FROM public.instructor_import_ledger WHERE run_id = f.run AND instructor_id = new_id) = 'created');
  PERFORM ledger_test.ok('previously failed row: clean first image on success',
    (SELECT instructor_row FROM public.instructor_import_ledger WHERE run_id = f.run AND instructor_id = f.t_fail) = (SELECT row FROM ledger_test.pre WHERE id = f.t_fail));
  PERFORM ledger_test.ok('ledger rows for run = 3 (create, update, formerly failed)',
    (SELECT count(*) FROM public.instructor_import_ledger WHERE run_id = f.run) = 3);
END $$;

-- this run's own photo step on t_fail (earlier-run import photo becomes non-current) – DB metadata only, no storage write
SELECT public.bc_register_import_photo((SELECT run FROM ledger_test.fx), 'lt-fail',
  (SELECT t_fail FROM ledger_test.fx)::text || '/import-' || repeat('a', 64) || '.jpg', repeat('a', 64), 10, 10);

-- ---------- immutability ----------
DO $$
DECLARE got text := 'ok';
BEGIN
  BEGIN UPDATE public.instructor_import_ledger SET source_id = 'x' WHERE run_id = (SELECT run FROM ledger_test.fx);
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM ledger_test.ok('ledger UPDATE blocked even for owner', got = 'ledger_immutable', got);
  got := 'ok';
  BEGIN DELETE FROM public.instructor_import_ledger WHERE run_id = (SELECT run FROM ledger_test.fx);
  EXCEPTION WHEN OTHERS THEN got := SQLERRM; END;
  PERFORM ledger_test.ok('ledger DELETE blocked even for owner', got = 'ledger_immutable', got);
END $$;

-- ---------- recovery dry-run ----------
-- All edits below happen in the SAME transaction as the apply (identical now()); detection must not rely on time.
UPDATE public.instructors SET hourly_rate = 99 WHERE id = (SELECT t_fail FROM ledger_test.fx);   -- intervening pay edit
-- intervening HR edit seconds after apply (same transaction, so same now()): must still be detected
UPDATE public.instructor_hr_private SET bank_raw = 'edited-by-staff' WHERE instructor_id = (SELECT t_fail FROM ledger_test.fx);
CREATE TABLE ledger_test.dry1 AS SELECT public.bc_recovery_dry_run((SELECT run FROM ledger_test.fx)) AS d;
INSERT INTO public.instructor_photos(instructor_id, storage_path, origin, is_current)
  SELECT applied_instructor_id, 'ledger-test/new-manual.jpg', 'manual_upload', true
  FROM public.instructor_import_staging WHERE id = (SELECT s_create FROM ledger_test.fx);
CREATE TABLE ledger_test.dry2 AS SELECT public.bc_recovery_dry_run((SELECT run FROM ledger_test.fx)) AS d;
DO $$
DECLARE d1 jsonb; d2 jsonb; ru jsonb; rf jsonb; rc1 jsonb; rc2 jsonb; f record;
BEGIN
  SELECT * INTO f FROM ledger_test.fx; SELECT d INTO d1 FROM ledger_test.dry1; SELECT d INTO d2 FROM ledger_test.dry2;
  SELECT e INTO ru FROM jsonb_array_elements(d1->'rows') e WHERE e->>'source_id' = 'lt-upd';
  SELECT e INTO rf FROM jsonb_array_elements(d1->'rows') e WHERE e->>'source_id' = 'lt-fail';
  SELECT e INTO rc1 FROM jsonb_array_elements(d1->'rows') e WHERE e->>'source_id' = 'lt-create';
  SELECT e INTO rc2 FROM jsonb_array_elements(d2->'rows') e WHERE e->>'source_id' = 'lt-create';
  PERFORM ledger_test.ok('dry-run reports all 3 run rows, 0 applied without ledger',
    (d1->'counts'->>'ledger_rows')::int = 3 AND (d1->'counts'->>'applied_without_ledger')::int = 0, d1->'counts'::text);
  PERFORM ledger_test.ok('dry-run stops on post-import manual edit (phone)',
    ru->>'verdict' = 'stop' AND ru->'reasons' ? 'edited_after_import:phone', ru->'reasons'::text);
  PERFORM ledger_test.ok('dry-run: city marked restorable',
    EXISTS (SELECT 1 FROM jsonb_array_elements(ru->'fields') x WHERE x->>'field' = 'city' AND x->>'status' = 'restorable'));
  PERFORM ledger_test.ok('dry-run stops on intervening pay edit', rf->'reasons' ? 'pay_changed:hourly_rate', rf->'reasons'::text);
  PERFORM ledger_test.ok('dry-run: this run''s own photo step is NOT a post-import change',
    NOT (rf->'reasons' ? 'photo_current_changed') AND (rf->'would_remove'->>'import_photos')::int = 1, rf::text);
  PERFORM ledger_test.ok('dry-run: no false profile_changed from automatic columns on update rows',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d1->'rows') e, jsonb_array_elements_text(e->'reasons') x
                WHERE x LIKE 'profile_changed:%'), d1::text);
  PERFORM ledger_test.ok('dry-run: unreferenced create = candidate only', rc1->>'verdict' = 'unreferenced_create_candidate', rc1::text);
  PERFORM ledger_test.ok('dry-run: HR edit within 60 s detected (field name only)',
    rf->'reasons' ? 'hr_private_changed_after_import:bank_raw', rf->'reasons'::text);
  PERFORM ledger_test.ok('dry-run: no false HR change on untouched rows (create + update)',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(rc1->'reasons' || ru->'reasons') x WHERE x LIKE 'hr_private_changed%'),
    (rc1->'reasons' || ru->'reasons')::text);
  PERFORM ledger_test.ok('dry-run: no false photo_metadata_changed (own photo step only flips is_current)',
    NOT (rf->'reasons' ? 'photo_metadata_changed') AND NOT (ru->'reasons' ? 'photo_metadata_changed'), rf->'reasons'::text);
  -- manual photo inserted in the same transaction (created_at = captured_at): detected by photo identity
  PERFORM ledger_test.ok('dry-run: create with manual photo → stop, referenced, no delete',
    rc2->>'verdict' = 'stop' AND rc2->'reasons' ? 'manual_photo_after_import' AND rc2->'reasons' ? 'referenced_cannot_delete', rc2->'reasons'::text);
  PERFORM ledger_test.ok('dry-run output carries no field values',
    position('+41 79' in d2::text) = 0 AND position('ledger-u@' in d2::text) = 0 AND position('CH00' in d2::text) = 0
    AND position('edited-by-staff' in d2::text) = 0 AND position('synthetic' in d2::text) = 0);
  PERFORM ledger_test.ok('dry-run wrote nothing (instructors unchanged by it)',
    (SELECT count(*) FROM public.instructors WHERE email = 'ledger-new@test.invalid') = 1);
END $$;

-- ---------- role probes (same mechanics as Gate A test) ----------
CREATE FUNCTION ledger_test.must(b boolean) RETURNS void LANGUAGE plpgsql AS
  $$ BEGIN IF b IS NOT TRUE THEN RAISE EXCEPTION 'assert'; END IF; END $$;
CREATE FUNCTION ledger_test.probe(uid uuid, r text, q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF r = 'authenticated' AND uid IS NULL THEN RETURN 'UNAVAILABLE'; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', r)::text, true);
    EXECUTE format('SET LOCAL ROLE %I', r);
    EXECUTE q;
    EXECUTE 'RESET ROLE';
    RETURN 'ok';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' OR SQLERRM = 'assert' THEN RETURN 'denied'; END IF;
    RETURN 'error:' || SQLSTATE || ' ' || left(SQLERRM, 80);
  END;
END $$;
CREATE FUNCTION ledger_test.t(actor text, test text, expect text, q text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE uid uuid; r text := 'authenticated'; got text;
BEGIN
  IF actor = 'anon' THEN r := 'anon'; ELSIF actor = 'service' THEN r := 'service_role';
  ELSE EXECUTE format('SELECT %I FROM ledger_test.who', actor) INTO uid; END IF;
  got := ledger_test.probe(uid, r, q);
  EXECUTE 'RESET ROLE';
  INSERT INTO ledger_test.res(test, pass, detail) VALUES (actor || ': ' || test, got = expect, 'expect ' || expect || ', got ' || got);
END $$;
GRANT USAGE ON SCHEMA ledger_test TO authenticated, anon, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ledger_test TO authenticated, anon, service_role;
GRANT SELECT ON ledger_test.fx TO authenticated, anon, service_role;

DO $$
DECLARE sel text := $q$SELECT ledger_test.must((SELECT count(*) FROM public.instructor_import_ledger WHERE run_id = (SELECT run FROM ledger_test.fx)) = 3)$q$;
BEGIN
  PERFORM ledger_test.t('sa_any',     'read ledger fixture rows (CONTROL)', 'ok',     sel);
  PERFORM ledger_test.t('service',    'read ledger fixture rows (CONTROL)', 'ok',     sel);
  PERFORM ledger_test.t('teacher',    'read ledger',                        'denied', sel);
  PERFORM ledger_test.t('office_any', 'read ledger',                        'denied', sel);
  PERFORM ledger_test.t('admin',      'read ledger',                        'denied', sel);
  PERFORM ledger_test.t('anon',       'read ledger',                        'denied', sel);
  PERFORM ledger_test.t('sa_any',     'insert ledger',                      'denied',
    $q$INSERT INTO public.instructor_import_ledger(run_id, staging_id, source_id, instructor_id, kind, row_sha256)
       SELECT run, s_upd, 'x', gen_random_uuid(), 'created', 'x' FROM ledger_test.fx$q$);
  PERFORM ledger_test.t('admin',      'call bc_recovery_dry_run',           'denied', $q$SELECT public.bc_recovery_dry_run((SELECT run FROM ledger_test.fx))$q$);
  PERFORM ledger_test.t('sa_any',     'call bc_recovery_dry_run directly',  'denied', $q$SELECT public.bc_recovery_dry_run((SELECT run FROM ledger_test.fx))$q$);
  PERFORM ledger_test.t('service',    'call bc_recovery_dry_run (CONTROL)', 'ok',     $q$SELECT public.bc_recovery_dry_run((SELECT run FROM ledger_test.fx))$q$);
  PERFORM ledger_test.t('admin',      'call bc_apply_batch',                'denied', $q$SELECT public.bc_apply_batch((SELECT run FROM ledger_test.fx), 1)$q$);
  PERFORM ledger_test.ok('ledger not in Realtime publication',
    NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename = 'instructor_import_ledger'));
  PERFORM ledger_test.ok('identities available (teacher, office, admin, super_admin)',
    (SELECT teacher IS NOT NULL AND office_any IS NOT NULL AND admin IS NOT NULL AND sa_any IS NOT NULL FROM ledger_test.who));
END $$;

-- ---------- real data unchanged (fixtures excluded) ----------
DO $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM ledger_test.fx;
  PERFORM ledger_test.ok('real instructors/roles/team/Booking links unchanged vs in-transaction baseline',
    (SELECT md5(string_agg(t::text, '' ORDER BY id)) FROM public.instructors t
       WHERE id NOT IN (f.t_upd, f.t_fail, f.t_chg, f.t_other)
         AND id NOT IN (SELECT applied_instructor_id FROM public.instructor_import_staging WHERE id = f.s_create)) = (SELECT rows_hash FROM ledger_test.fp)
    AND (SELECT md5(string_agg(user_id::text||role::text, ',' ORDER BY user_id, role)) FROM public.user_roles) = (SELECT roles_hash FROM ledger_test.fp)
    AND (SELECT count(*) FROM public.instructors WHERE show_on_website AND status = 'active') = (SELECT team FROM ledger_test.fp)
    AND (SELECT count(*) FROM public.instructor_source_links WHERE source_system = 'booking_corner') = (SELECT bc_links FROM ledger_test.fp),
    (SELECT format('baseline instructors=%s roles=%s team=%s bc_links=%s', n_instructors, n_roles, team, bc_links) FROM ledger_test.fp));
END $$;

SELECT n, pass, test, detail FROM ledger_test.res ORDER BY n;
SELECT count(*) AS checks, count(*) FILTER (WHERE pass) AS passed, bool_and(pass) AS all_passed,
  (SELECT format('instructors=%s roles=%s team=%s bc_links=%s', n_instructors, n_roles, team, bc_links) FROM ledger_test.fp) AS live_baseline
FROM ledger_test.res;
ROLLBACK;
