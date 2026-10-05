-- Rollback for supabase/pending/course_archive_delete.sql.
-- Run only after restoring every archived course (SELECT id FROM group_courses WHERE archived_at IS NOT NULL
-- must be empty or explicitly accepted), otherwise archived courses reappear in the list.
BEGIN;
DROP FUNCTION IF EXISTS public.course_delete_if_unused(uuid, uuid);
DROP FUNCTION IF EXISTS public.course_set_archived(uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.course_dependencies(uuid);
ALTER TABLE public.group_courses DROP COLUMN IF EXISTS archived_by;
ALTER TABLE public.group_courses DROP COLUMN IF EXISTS archived_at;
COMMIT;
