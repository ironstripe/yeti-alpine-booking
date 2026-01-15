-- Add comment to document the new status for pending_confirmation
COMMENT ON COLUMN public.tickets.status IS 
  'Status values: draft, pending_confirmation, confirmed, in_progress, completed, cancelled';

-- Create a view for pending booking confirmations (for Dashboard widget)
CREATE OR REPLACE VIEW public.pending_booking_confirmations AS
SELECT 
  t.id AS ticket_id,
  t.ticket_number,
  t.status,
  t.created_at,
  t.total_amount,
  c.id AS customer_id,
  COALESCE(c.first_name || ' ', '') || c.last_name AS customer_name,
  c.email AS customer_email,
  conv.id AS conversation_id,
  conv.channel AS source_channel,
  (
    SELECT COUNT(*)::int 
    FROM ticket_items ti 
    WHERE ti.ticket_id = t.id
  ) AS item_count
FROM tickets t
JOIN customers c ON c.id = t.customer_id
LEFT JOIN conversations conv ON conv.related_ticket_id = t.id
WHERE t.status = 'pending_confirmation'
ORDER BY t.created_at DESC;

-- Grant access to the view
GRANT SELECT ON public.pending_booking_confirmations TO authenticated;