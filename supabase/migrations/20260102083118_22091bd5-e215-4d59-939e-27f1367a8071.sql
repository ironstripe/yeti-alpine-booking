-- Add missing fields to instructors table
ALTER TABLE public.instructors
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS street text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS zip text,
ADD COLUMN IF NOT EXISTS country text DEFAULT 'LI',
ADD COLUMN IF NOT EXISTS languages text[] DEFAULT ARRAY['de'],
ADD COLUMN IF NOT EXISTS role text DEFAULT 'rolle_1',
ADD COLUMN IF NOT EXISTS entry_date date DEFAULT CURRENT_DATE;