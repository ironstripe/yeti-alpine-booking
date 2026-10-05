-- Course archive + guarded hard delete (PREPARED ONLY — not applied).
-- Additive: two nullable columns on group_courses and three service_role-only functions,
-- called exclusively by the office/admin Edge Function `course-management`.
-- Rollback: supabase/rollback/course_archive_delete_rollback.sql
-- Tests:    tests/courseArchive.integration.mjs (local PostgreSQL + production schema baseline)
BEGIN;

ALTER TABLE public.group_courses
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;
COMMENT ON COLUMN public.group_courses.archived_at IS
  'Set = hidden from course list and new selection. Independent of is_active. Rows, IDs, instances, enrollments and import links stay intact.';

-- Dependencies that make a hard delete unsafe (would erase bookings, planning or import provenance,
-- or is blocked by NO ACTION foreign keys).
CREATE OR REPLACE FUNCTION public.course_dependencies(p_course uuid) RETURNS jsonb
  LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'enrollments', (SELECT count(*) FROM group_course_enrollments e JOIN group_course_instances i ON i.id = e.instance_id WHERE i.course_id = p_course),
    'original_course_refs', (SELECT count(*) FROM group_course_enrollments WHERE original_course_id = p_course),
    'event_refs', (SELECT count(*) FROM event_categories WHERE training_id = p_course),
    'source_period_links', (SELECT count(*) FROM bc_2627_course_period_sources WHERE course_id = p_course),
    'source_product_links', (SELECT count(*) FROM bc_2627_course_product_variants WHERE course_id = p_course),
    'assigned_instances', (SELECT count(*) FROM group_course_instances WHERE course_id = p_course AND (instructor_id IS NOT NULL OR assistant_instructor_id IS NOT NULL)),
    'assigned_dates', (SELECT count(*) FROM training_course_dates WHERE training_id = p_course AND instructor_id IS NOT NULL),
    'shift_assignments', (SELECT count(*) FROM office_shift_assignments s JOIN group_course_instances i ON i.id = s.instance_id WHERE i.course_id = p_course),
    'transfer_requests', (SELECT count(*) FROM participant_transfer_requests t JOIN group_course_instances i ON i.id IN (t.source_group_id, t.target_group_id) WHERE i.course_id = p_course),
    'instances', (SELECT count(*) FROM group_course_instances WHERE course_id = p_course),
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
      -- Archive implies not for sale; is_active is only ever lowered, never raised.
      UPDATE group_courses SET archived_at = now(), archived_by = p_actor, is_active = false, updated_at = now() WHERE id = p_course;
    END IF;
  ELSE
    -- Restore as inactive; never re-activate for sale.
    UPDATE group_courses SET archived_at = NULL, archived_by = NULL, is_active = false, updated_at = now()
      WHERE id = p_course AND archived_at IS NOT NULL;
  END IF;
  RETURN jsonb_build_object('ok', true, 'archived', p_archive);
END $$;

CREATE OR REPLACE FUNCTION public.course_delete_if_unused(p_course uuid, p_actor uuid) RETURNS jsonb
  LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE deps jsonb; blocking jsonb; n int;
BEGIN
  PERFORM 1 FROM group_courses WHERE id = p_course FOR UPDATE;  -- blocks concurrent FK inserts (KEY SHARE)
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  deps := course_dependencies(p_course);
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO blocking
    FROM jsonb_each(deps) WHERE key NOT IN ('instances', 'dates') AND (value)::int > 0;
  IF blocking <> '{}'::jsonb THEN
    RETURN jsonb_build_object('error', 'referenced', 'dependencies', deps);
  END IF;
  BEGIN
    DELETE FROM group_courses WHERE id = p_course;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('error', 'referenced', 'dependencies', course_dependencies(p_course));
  END;
  IF n <> 1 THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'deleted', 1);
END $$;

REVOKE ALL ON FUNCTION public.course_dependencies(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.course_set_archived(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.course_delete_if_unused(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.course_dependencies(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.course_set_archived(uuid, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.course_delete_if_unused(uuid, uuid) TO service_role;

COMMIT;
