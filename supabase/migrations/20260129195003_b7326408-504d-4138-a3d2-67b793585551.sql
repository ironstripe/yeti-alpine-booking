-- Create RPC function to manage instructor capabilities
-- This function allows admin/office staff to set the capabilities for an instructor
-- using a simple delete-then-insert approach for idempotent many-to-many management

CREATE OR REPLACE FUNCTION public.set_instructor_capabilities(
  p_instructor_id UUID,
  p_capability_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capability_id UUID;
BEGIN
  -- 1. Authorization Check
  IF NOT public.is_admin_or_office(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: You must be admin or office staff to set instructor capabilities.';
  END IF;

  -- 2. Delete Existing Capabilities
  DELETE FROM public.instructor_capabilities
  WHERE instructor_id = p_instructor_id;

  -- 3. Insert New Capabilities (if any provided)
  IF p_capability_ids IS NOT NULL AND array_length(p_capability_ids, 1) > 0 THEN
    FOREACH v_capability_id IN ARRAY p_capability_ids LOOP
      INSERT INTO public.instructor_capabilities (instructor_id, capability_id)
      VALUES (p_instructor_id, v_capability_id);
    END LOOP;
  END IF;
END;
$$;