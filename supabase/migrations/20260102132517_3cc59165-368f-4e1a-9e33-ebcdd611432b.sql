-- Phase 1: User Roles (RBAC)

-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'office', 'teacher');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create has_role security definer function (prevents infinite recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user has any admin/office role
CREATE OR REPLACE FUNCTION public.is_admin_or_office(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'office')
  )
$$;

-- Create function to get instructor ID for a user (by email match)
CREATE OR REPLACE FUNCTION public.get_instructor_for_user(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id FROM public.instructors i
  JOIN auth.users u ON LOWER(u.email) = LOWER(i.email)
  WHERE u.id = _user_id
  LIMIT 1
$$;

-- RLS Policies for user_roles
-- Users can view their own roles
CREATE POLICY "Users can view own roles" 
ON public.user_roles FOR SELECT 
TO authenticated
USING (user_id = auth.uid() OR public.is_admin_or_office(auth.uid()));

-- Only admins can insert roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update roles
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete roles
CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Phase 2: Absence Status and Approval

-- Add status and approval columns to instructor_absences
ALTER TABLE public.instructor_absences 
ADD COLUMN status TEXT DEFAULT 'confirmed' NOT NULL,
ADD COLUMN approved_by UUID REFERENCES auth.users(id),
ADD COLUMN approved_at TIMESTAMPTZ,
ADD COLUMN rejection_reason TEXT,
ADD COLUMN requested_by UUID REFERENCES auth.users(id);

-- Add constraint for valid statuses
ALTER TABLE public.instructor_absences
ADD CONSTRAINT absence_status_check 
CHECK (status IN ('pending', 'confirmed', 'rejected'));

-- Phase 3: Notification Queue

-- Create notification_queue table for tracking notifications
CREATE TABLE public.notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  notification_type TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_id UUID,
  recipient_email TEXT,
  recipient_phone TEXT,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT notification_status_check CHECK (status IN ('pending', 'sent', 'failed'))
);

-- Enable RLS on notification_queue
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Admins/Office can view all notifications
CREATE POLICY "Admins can view notifications"
ON public.notification_queue FOR SELECT
TO authenticated
USING (public.is_admin_or_office(auth.uid()));

-- Admins/Office can insert notifications
CREATE POLICY "Admins can insert notifications"
ON public.notification_queue FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_office(auth.uid()));

-- Service role and admins can update notifications (for edge function)
CREATE POLICY "Admins can update notifications"
ON public.notification_queue FOR UPDATE
TO authenticated
USING (public.is_admin_or_office(auth.uid()));