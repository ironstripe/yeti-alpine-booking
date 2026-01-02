-- Add holiday_address and additional contacts to customers table
ALTER TABLE public.customers 
ADD COLUMN holiday_address text NOT NULL DEFAULT '',
ADD COLUMN additional_phones jsonb DEFAULT '[]'::jsonb,
ADD COLUMN additional_emails jsonb DEFAULT '[]'::jsonb;

-- Rename level to level_last_season and add level_current_season to customer_participants
ALTER TABLE public.customer_participants 
RENAME COLUMN level TO level_last_season;

ALTER TABLE public.customer_participants 
ADD COLUMN level_current_season text;