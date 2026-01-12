-- =====================================================
-- SCHOOL/SKILAGER BOOKING MODULE - DATABASE EXTENSIONS
-- =====================================================

-- 1. Extend customers table for schools
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'private';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_email TEXT;

-- 2. Create customer_contacts table for multiple contact persons
CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);

-- Enable RLS on customer_contacts
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for customer_contacts
CREATE POLICY "Authenticated users can view customer_contacts" 
ON customer_contacts FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert customer_contacts" 
ON customer_contacts FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update customer_contacts" 
ON customer_contacts FOR UPDATE 
USING (true);

CREATE POLICY "Authenticated users can delete customer_contacts" 
ON customer_contacts FOR DELETE 
USING (true);

-- Trigger to ensure only one primary contact per customer
CREATE OR REPLACE FUNCTION ensure_single_primary_contact()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE customer_contacts 
    SET is_primary = false 
    WHERE customer_id = NEW.customer_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_single_primary_contact ON customer_contacts;
CREATE TRIGGER trg_single_primary_contact
BEFORE INSERT OR UPDATE ON customer_contacts
FOR EACH ROW EXECUTE FUNCTION ensure_single_primary_contact();

-- 3. Extend tickets table for school camps
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type TEXT DEFAULT 'standard';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS camp_start_date DATE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS camp_end_date DATE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS total_participants INTEGER;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS skip_documents BOOLEAN DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS notes_for_instructors TEXT;

-- 4. Extend ticket_items for school groups
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'participant';
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS group_participant_count INTEGER;
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS custom_start_time TIME;
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS custom_end_time TIME;
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS skill_level TEXT;

-- 5. Add school_tariff to school_settings table
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS school_tariff JSONB DEFAULT '{
  "hourly_rate": 95.00,
  "currency": "CHF",
  "min_hours_per_group": 1.5,
  "description": "Reduzierter Stundensatz für Schulen und Skilager"
}'::jsonb;