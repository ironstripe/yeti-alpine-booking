-- Create ticket_item_overrides table for per-day variations in period bookings
CREATE TABLE public.ticket_item_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_item_id UUID NOT NULL REFERENCES public.ticket_items(id) ON DELETE CASCADE,
  override_date DATE NOT NULL,
  instructor_id UUID REFERENCES public.instructors(id) ON DELETE SET NULL,
  start_time TIME,
  end_time TIME,
  price_adjustment NUMERIC(10, 2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ticket_item_id, override_date)
);

-- Enable Row Level Security
ALTER TABLE public.ticket_item_overrides ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (same access pattern as ticket_items)
CREATE POLICY "Authenticated users can view ticket item overrides"
ON public.ticket_item_overrides
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert ticket item overrides"
ON public.ticket_item_overrides
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update ticket item overrides"
ON public.ticket_item_overrides
FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete ticket item overrides"
ON public.ticket_item_overrides
FOR DELETE
USING (auth.role() = 'authenticated');

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ticket_item_overrides_updated_at
BEFORE UPDATE ON public.ticket_item_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups by ticket_item_id
CREATE INDEX idx_ticket_item_overrides_ticket_item_id ON public.ticket_item_overrides(ticket_item_id);

-- Add index for date-based queries
CREATE INDEX idx_ticket_item_overrides_date ON public.ticket_item_overrides(override_date);

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_item_overrides;

-- Add end_date column to ticket_items for period bookings (if not exists)
ALTER TABLE public.ticket_items ADD COLUMN IF NOT EXISTS end_date DATE;