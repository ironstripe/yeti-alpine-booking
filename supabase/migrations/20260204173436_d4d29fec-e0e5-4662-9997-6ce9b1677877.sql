-- Phase 1: Period Bookings Schema Changes

-- 1.1 Add period grouping columns to ticket_items
ALTER TABLE ticket_items
ADD COLUMN IF NOT EXISTS period_group_id UUID,
ADD COLUMN IF NOT EXISTS is_period_override BOOLEAN DEFAULT FALSE;

-- Index for efficient period lookups
CREATE INDEX IF NOT EXISTS idx_ticket_items_period_group 
ON ticket_items(period_group_id) 
WHERE period_group_id IS NOT NULL;

-- 1.2 Create ticket_item_period_metadata table
CREATE TABLE IF NOT EXISTS ticket_item_period_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_group_id UUID NOT NULL UNIQUE,
  base_instructor_id UUID REFERENCES instructors(id),
  base_time_start TIME NOT NULL,
  base_time_end TIME NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient date range queries
CREATE INDEX IF NOT EXISTS idx_period_metadata_dates 
ON ticket_item_period_metadata(start_date, end_date);

-- Index for period group lookups
CREATE INDEX IF NOT EXISTS idx_period_metadata_group 
ON ticket_item_period_metadata(period_group_id);

-- 1.3 Add confirmation tracking columns to ticket_items
ALTER TABLE ticket_items
ADD COLUMN IF NOT EXISTS confirmation_reset_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmation_reset_reason TEXT;

-- Enable RLS on the new table
ALTER TABLE ticket_item_period_metadata ENABLE ROW LEVEL SECURITY;

-- RLS policies for ticket_item_period_metadata (authenticated users can read/write)
CREATE POLICY "Authenticated users can view period metadata"
ON ticket_item_period_metadata
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert period metadata"
ON ticket_item_period_metadata
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update period metadata"
ON ticket_item_period_metadata
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete period metadata"
ON ticket_item_period_metadata
FOR DELETE
TO authenticated
USING (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_period_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_period_metadata_updated_at
BEFORE UPDATE ON ticket_item_period_metadata
FOR EACH ROW
EXECUTE FUNCTION update_period_metadata_updated_at();