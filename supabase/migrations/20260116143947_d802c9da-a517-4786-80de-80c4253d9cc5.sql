-- Create private lesson rates table for time-slot based pricing
CREATE TABLE IF NOT EXISTS public.private_lesson_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  rate_per_hour DECIMAL(10,2) NOT NULL,
  is_peak BOOLEAN DEFAULT false,
  additional_person_rate DECIMAL(10,2) DEFAULT 20.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(start_time, end_time)
);

-- Enable RLS
ALTER TABLE public.private_lesson_rates ENABLE ROW LEVEL SECURITY;

-- RLS policies - everyone can read (needed for booking wizard)
CREATE POLICY "Anyone can view private lesson rates" ON public.private_lesson_rates
  FOR SELECT USING (true);

-- Only authenticated users can manage rates
CREATE POLICY "Authenticated users can manage rates" ON public.private_lesson_rates
  FOR ALL USING (auth.role() = 'authenticated');

-- Insert default rates based on business rules
INSERT INTO public.private_lesson_rates (start_time, end_time, rate_per_hour, is_peak) VALUES
  ('09:00', '10:00', 75.00, false),  -- Off-peak (Randzeit)
  ('10:00', '12:00', 85.00, true),   -- Peak (Hauptzeit)
  ('12:00', '14:00', 75.00, false),  -- Off-peak (Randzeit)
  ('14:00', '16:00', 85.00, true);   -- Peak (Hauptzeit)

-- Create trigger for updated_at
CREATE TRIGGER update_private_lesson_rates_updated_at
  BEFORE UPDATE ON public.private_lesson_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();