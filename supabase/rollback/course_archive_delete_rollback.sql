-- Rollback for the course archive/delete capability (drizzle migration course_archive_delete).
-- Run only after restoring every archived course (SELECT id FROM group_courses WHERE archived_at IS NOT NULL
-- must be empty or explicitly accepted). course_deletion_log is KEPT: it is the only provenance of
-- already deleted courses; drop it manually only after exporting it.
BEGIN;
DROP FUNCTION IF EXISTS public.course_delete_if_unused(uuid, uuid);
DROP FUNCTION IF EXISTS public.course_set_archived(uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.course_dependencies(uuid);
ALTER TABLE public.group_courses DROP COLUMN IF EXISTS archived_by;
ALTER TABLE public.group_courses DROP COLUMN IF EXISTS archived_at;
COMMIT;
