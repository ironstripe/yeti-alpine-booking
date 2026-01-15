-- Add booking_ready column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS booking_ready BOOLEAN DEFAULT false;

-- Add data_completeness column for the rule-based score
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS data_completeness NUMERIC DEFAULT 0;