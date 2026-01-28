-- =====================================================
-- YETY Ski School - Instructor Booking Confirmation Workflow
-- =====================================================
-- This migration adds:
-- 1. Columns to ticket_items for tracking instructor declines
-- 2. instructor_activity_log table for audit trail
-- 3. whatsapp_notifications table for message tracking
-- =====================================================

-- =====================================================
-- 1. EXTEND ticket_items TABLE
-- =====================================================

-- Add columns for instructor decline tracking
ALTER TABLE public.ticket_items 
  ADD COLUMN IF NOT EXISTS instructor_decline_reason TEXT,
  ADD COLUMN IF NOT EXISTS instructor_declined_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ticket_items.instructor_decline_reason 
  IS 'Reason provided by instructor when declining a booking';
COMMENT ON COLUMN public.ticket_items.instructor_declined_at 
  IS 'Timestamp when instructor declined the booking';

-- =====================================================
-- 2. CREATE instructor_activity_log TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.instructor_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  ticket_item_id UUID NOT NULL REFERENCES public.ticket_items(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_by_user_id UUID REFERENCES auth.users(id),
  
  CONSTRAINT activity_type_check CHECK (activity_type IN (
    'booking_assigned',
    'booking_confirmed', 
    'booking_declined',
    'booking_changed',
    'booking_cancelled',
    'reminder_sent'
  ))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_log_instructor_id 
  ON public.instructor_activity_log(instructor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_ticket_item_id 
  ON public.instructor_activity_log(ticket_item_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at 
  ON public.instructor_activity_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.instructor_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Instructors can view their own activity log"
ON public.instructor_activity_log
FOR SELECT
TO authenticated
USING (instructor_id = public.get_instructor_for_user(auth.uid()));

CREATE POLICY "Admin and office can view all activity logs"
ON public.instructor_activity_log
FOR SELECT
TO authenticated
USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Authenticated users can insert activity logs"
ON public.instructor_activity_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Add comments
COMMENT ON TABLE public.instructor_activity_log 
  IS 'Audit trail for all instructor-related booking activities';
COMMENT ON COLUMN public.instructor_activity_log.activity_type 
  IS 'Type: booking_assigned, booking_confirmed, booking_declined, booking_changed, booking_cancelled, reminder_sent';
COMMENT ON COLUMN public.instructor_activity_log.metadata 
  IS 'Additional JSON data like old/new values for changes';

-- =====================================================
-- 3. CREATE whatsapp_notifications TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_id UUID NOT NULL,
  recipient_type TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  message_type TEXT NOT NULL,
  template_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  whatsapp_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  
  CONSTRAINT recipient_type_check CHECK (recipient_type IN ('instructor', 'customer')),
  CONSTRAINT status_check CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_recipient 
  ON public.whatsapp_notifications(recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_status 
  ON public.whatsapp_notifications(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_notifications_created_at 
  ON public.whatsapp_notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only admin/office can access
CREATE POLICY "Admin and office can view WhatsApp notifications"
ON public.whatsapp_notifications
FOR SELECT
TO authenticated
USING (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can insert WhatsApp notifications"
ON public.whatsapp_notifications
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_office(auth.uid()));

CREATE POLICY "Admin and office can update WhatsApp notifications"
ON public.whatsapp_notifications
FOR UPDATE
TO authenticated
USING (public.is_admin_or_office(auth.uid()));

-- Add comments
COMMENT ON TABLE public.whatsapp_notifications 
  IS 'Log of all outgoing WhatsApp messages for debugging and tracking';
COMMENT ON COLUMN public.whatsapp_notifications.recipient_type 
  IS 'Type of recipient: instructor or customer';
COMMENT ON COLUMN public.whatsapp_notifications.message_type 
  IS 'Type of message: booking_assigned, booking_changed, reminder, etc.';
COMMENT ON COLUMN public.whatsapp_notifications.status 
  IS 'Delivery status: pending, sent, delivered, read, failed';