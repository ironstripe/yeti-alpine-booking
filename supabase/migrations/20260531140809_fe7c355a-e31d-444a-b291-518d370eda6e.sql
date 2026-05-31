ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'office';
CREATE INDEX IF NOT EXISTS idx_tickets_source ON public.tickets(source);
COMMENT ON COLUMN public.tickets.source IS 'Origin of the booking: office (manual), website (online form), vapi (phone AI), inbox (email conversion)';