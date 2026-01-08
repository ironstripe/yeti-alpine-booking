-- Enable realtime for tables not yet added (skip instructor_absences which is already added)
DO $$
BEGIN
  -- Tickets
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tickets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
  END IF;
  
  -- Ticket items
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ticket_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_items;
  END IF;
  
  -- Booking requests
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'booking_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_requests;
  END IF;
  
  -- Payments
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'payments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;
  
  -- Groups
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'groups') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
  END IF;
  
  -- Shop articles
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'shop_articles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_articles;
  END IF;
  
  -- Shop transactions
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'shop_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_transactions;
  END IF;
  
  -- Conversations
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

-- Set REPLICA IDENTITY for proper DELETE event payloads
ALTER TABLE public.tickets REPLICA IDENTITY FULL;
ALTER TABLE public.ticket_items REPLICA IDENTITY FULL;
ALTER TABLE public.booking_requests REPLICA IDENTITY FULL;
ALTER TABLE public.instructor_absences REPLICA IDENTITY FULL;
ALTER TABLE public.groups REPLICA IDENTITY FULL;