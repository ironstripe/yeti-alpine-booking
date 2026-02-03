-- Table for managing participant transfer requests between groups
CREATE TABLE public.participant_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_group_id UUID NOT NULL REFERENCES public.group_course_instances(id) ON DELETE CASCADE,
  target_group_id UUID NOT NULL REFERENCES public.group_course_instances(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.customer_participants(id) ON DELETE CASCADE,
  requesting_instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create partial unique index: A participant can only have one pending transfer request at a time
CREATE UNIQUE INDEX unique_pending_participant_request 
ON public.participant_transfer_requests (participant_id) 
WHERE (status = 'pending');

-- Trigger to automatically update the `updated_at` timestamp (using existing function)
CREATE TRIGGER handle_participant_transfer_requests_updated_at
BEFORE UPDATE ON public.participant_transfer_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.participant_transfer_requests ENABLE ROW LEVEL SECURITY;

-- Policy 1: Instructors can see requests they are involved in (as requester or target)
CREATE POLICY "Instructors can view their transfer requests"
ON public.participant_transfer_requests
FOR SELECT
USING (
  public.get_instructor_for_user(auth.uid()) = requesting_instructor_id
  OR public.get_instructor_for_user(auth.uid()) = (
    SELECT instructor_id FROM public.group_course_instances WHERE id = target_group_id
  )
);

-- Policy 2: Instructors can create new transfer requests
CREATE POLICY "Instructors can create transfer requests"
ON public.participant_transfer_requests
FOR INSERT
WITH CHECK (
  public.get_instructor_for_user(auth.uid()) = requesting_instructor_id
);

-- Policy 3: Target instructor can respond to pending requests (accept or reject)
CREATE POLICY "Target instructor can respond to requests"
ON public.participant_transfer_requests
FOR UPDATE
USING (
  public.get_instructor_for_user(auth.uid()) = (
    SELECT instructor_id FROM public.group_course_instances WHERE id = target_group_id
  )
  AND status = 'pending'
)
WITH CHECK (
  status IN ('accepted', 'rejected')
);

-- Policy 4: Requesting instructor can cancel their own pending requests
CREATE POLICY "Requesting instructor can cancel requests"
ON public.participant_transfer_requests
FOR UPDATE
USING (
  public.get_instructor_for_user(auth.uid()) = requesting_instructor_id
  AND status = 'pending'
)
WITH CHECK (
  status = 'canceled'
);

-- Policy 5: Admins and Office staff have full access
CREATE POLICY "Admin and office have full access"
ON public.participant_transfer_requests
FOR ALL
USING (
  public.is_admin_or_office(auth.uid())
);