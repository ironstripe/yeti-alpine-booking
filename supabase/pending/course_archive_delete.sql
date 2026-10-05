-- Course archive + protected hard delete. INSTALLED as drizzle/migrations/0002_course_archive_delete.sql (kept here as reviewed source).
-- Additive: two nullable columns on group_courses, one service_role-only audit table and three
-- service_role-only functions, called exclusively by the office/admin Edge Function `course-management`.
-- Technical 26/27 source links (bc_2627_course_period_sources / _product_variants rows owned by the
-- course) and empty generated structure (schedules, instances, dates, training groups) do NOT block
-- deletion: they are snapshotted into course_deletion_log and removed in the same transaction.
-- Shared products, bc_product_tariff_sources and all source FKs (NO ACTION) stay untouched.
-- Real usage (enrollments, participant/progression refs, teacher assignments, transfers, shifts,
-- notifications, events, cross-course merges) blocks with counts; nothing is cascaded or SET NULL.
-- Rollback: supabase/rollback/course_archive_delete_rollback.sql
-- Tests:    tests/courseArchive.integration.mjs (local PostgreSQL + production schema baseline)

ALTER TABLE public.group_courses
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;
COMMENT ON COLUMN public.group_courses.archived_at IS
  'Set = hidden from course list and new selection. Independent of is_active. Rows, IDs, instances, enrollments and import links stay intact.';

CREATE TABLE IF NOT EXISTS public.course_deletion_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  course_name text NOT NULL,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);
COMMENT ON TABLE public.course_deletion_log IS
  'Immutable provenance of deleted courses: full course row, removed 26/27 source link rows and counts of removed generated structure.';
REVOKE ALL ON public.course_deletion_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.course_deletion_log TO service_role;
ALTER TABLE public.course_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.course_dependencies(p_course uuid) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH inst AS (SELECT id FROM group_course_instances WHERE course_id = p_course),
       grp  AS (SELECT id FROM training_groups WHERE course_id = p_course)
  SELECT jsonb_build_object(
    -- blocking: real usage / history
    'enrollments', (SELECT count(*) FROM group_course_enrollments e
                     WHERE e.instance_id IN (SELECT id FROM inst) OR e.training_group_id IN (SELECT id FROM grp)),
    'original_course_refs', (SELECT count(*) FROM group_course_enrollments WHERE original_course_id = p_course),
    'event_refs', (SELECT count(*) FROM event_categories WHERE training_id = p_course),
    'participant_course_refs', (SELECT count(*) FROM customer_participants
                     WHERE current_ski_training_id = p_course OR current_snowboard_training_id = p_course),
    'next_course_refs', (SELECT count(*) FROM group_courses WHERE next_training_id = p_course AND id <> p_course),
    'assigned_instances', (SELECT count(*) FROM group_course_instances WHERE course_id = p_course
                     AND (instructor_id IS NOT NULL OR assistant_instructor_id IS NOT NULL)),
    'assigned_groups', (SELECT count(*) FROM training_groups WHERE course_id = p_course
                     AND (instructor_id IS NOT NULL OR assistant_instructor_id IS NOT NULL)),
    'assigned_dates', (SELECT count(*) FROM training_course_dates WHERE training_id = p_course AND instructor_id IS NOT NULL),
    'shift_assignments', (SELECT count(*) FROM office_shift_assignments WHERE instance_id IN (SELECT id FROM inst)),
    'transfer_requests', (SELECT count(*) FROM participant_transfer_requests
                     WHERE source_group_id IN (SELECT id FROM inst) OR target_group_id IN (SELECT id FROM inst)),
    'notification_refs', (SELECT count(*) FROM instructor_notification_queue WHERE group_instance_id IN (SELECT id FROM inst)),
    'merge_refs', (SELECT count(*) FROM training_groups g
                     WHERE (g.course_id <> p_course AND g.merged_into_group_id IN (SELECT id FROM grp))
                        OR (g.course_id = p_course AND g.merged_into_group_id IS NOT NULL
                            AND g.merged_into_group_id NOT IN (SELECT id FROM grp))),
    'foreign_source_links', (SELECT count(*) FROM bc_2627_course_period_sources
                     WHERE training_group_id IN (SELECT id FROM grp) AND course_id <> p_course),
    -- non-blocking: owned technical structure removed with the course
    'source_period_links', (SELECT count(*) FROM bc_2627_course_period_sources WHERE course_id = p_course),
    'source_product_links', (SELECT count(*) FROM bc_2627_course_product_variants WHERE course_id = p_course),
    'instances', (SELECT count(*) FROM inst),
    'groups', (SELECT count(*) FROM grp),
    'schedules', (SELECT count(*) FROM group_course_schedules WHERE course_id = p_course),
    'dates', (SELECT count(*) FROM training_course_dates WHERE training_id = p_course)
  );
$$;

CREATE OR REPLACE FUNCTION public.course_set_archived(p_course uuid, p_archive boolean, p_actor uuid) RETURNS jsonb
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  SELECT id, archived_at, is_active INTO r FROM group_courses WHERE id = p_course FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  IF p_archive THEN
    IF r.archived_at IS NULL THEN
      UPDATE group_courses SET archived_at = now(), archived_by = p_actor, is_active = false, updated_at = now() WHERE id = p_course;
    END IF;
  ELSE
    UPDATE group_courses SET archived_at = NULL, archived_by = NULL, is_active = false, updated_at = now()
      WHERE id = p_course AND archived_at IS NOT NULL;
  END IF;
  RETURN jsonb_build_object('ok', true, 'archived', p_archive);
END $$;

CREATE OR REPLACE FUNCTION public.course_delete_if_unused(p_course uuid, p_actor uuid) RETURNS jsonb
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE deps jsonb; blocking jsonb; n int; c jsonb; log_id uuid;
BEGIN
  -- Lock parent, then every owned child that new references can attach to. Concurrent FK inserts
  -- (enrollments, transfers, shifts, notifications, participant refs) take KEY SHARE on these rows
  -- and therefore wait; uncommitted ones make us wait and are visible to the recheck below.
  SELECT to_jsonb(g) INTO c FROM group_courses g WHERE id = p_course FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  PERFORM 1 FROM group_course_instances WHERE course_id = p_course FOR UPDATE;
  PERFORM 1 FROM training_groups WHERE course_id = p_course FOR UPDATE;
  PERFORM 1 FROM training_course_dates WHERE training_id = p_course FOR UPDATE;
  PERFORM 1 FROM bc_2627_course_period_sources WHERE course_id = p_course FOR UPDATE;
  PERFORM 1 FROM bc_2627_course_product_variants WHERE course_id = p_course FOR UPDATE;

  deps := course_dependencies(p_course);
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO blocking FROM jsonb_each(deps)
   WHERE key NOT IN ('instances', 'dates', 'groups', 'schedules', 'source_period_links', 'source_product_links')
     AND (value)::int > 0;
  IF blocking <> '{}'::jsonb THEN
    RETURN jsonb_build_object('error', 'referenced', 'dependencies', deps);
  END IF;

  BEGIN  -- subtransaction: audit + removal succeed or roll back together
    INSERT INTO course_deletion_log(course_id, course_name, deleted_by, snapshot)
    VALUES (p_course, c->>'name', p_actor, jsonb_build_object(
      'course', c,
      'counts', deps,
      'source_period_links', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.source_key), '[]') FROM bc_2627_course_period_sources s WHERE course_id = p_course),
      'source_product_links', (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.product_id), '[]') FROM bc_2627_course_product_variants v WHERE course_id = p_course)))
    RETURNING id INTO log_id;
    DELETE FROM bc_2627_course_period_sources WHERE course_id = p_course;
    DELETE FROM bc_2627_course_product_variants WHERE course_id = p_course;
    DELETE FROM group_courses WHERE id = p_course;  -- cascades owned schedules/instances/dates/groups
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'course_delete_row_count' USING ERRCODE = 'P0001'; END IF;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('error', 'referenced', 'dependencies', course_dependencies(p_course));
  END;
  RETURN jsonb_build_object('ok', true, 'deleted', 1, 'instances', (deps->>'instances')::int, 'log_id', log_id);
END $$;

REVOKE ALL ON FUNCTION public.course_dependencies(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.course_set_archived(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.course_delete_if_unused(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.course_dependencies(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.course_set_archived(uuid, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.course_delete_if_unused(uuid, uuid) TO service_role;
