-- Create table for test tokens that map to instructors
CREATE TABLE public.instructor_test_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  instructor_id UUID NOT NULL REFERENCES public.instructors(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ, -- NULL = never expires
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instructor_test_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can read these tokens (edge function will use service role)
-- No public access needed

-- Insert 3 test tokens for the real instructors
INSERT INTO public.instructor_test_tokens (token, instructor_id) VALUES
  ('tester-alpha-2026', 'a31fc4c1-42fb-4c94-bf57-8a86abbde9db'),  -- Leila Azaroual
  ('tester-beta-2026', '6c8542a3-9b6d-4620-9dc7-a1ec351e0c22'),   -- Max Bender
  ('tester-gamma-2026', 'ddfab510-ab01-4b47-9c40-1d4441828b13');  -- Christoph Bühler