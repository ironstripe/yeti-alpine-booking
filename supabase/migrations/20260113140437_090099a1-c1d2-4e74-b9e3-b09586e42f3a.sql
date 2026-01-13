-- Add vegetarian flag to ticket_items for lunch bookings
-- This tracks dietary preference per booking (not per participant profile)
ALTER TABLE ticket_items ADD COLUMN IF NOT EXISTS is_vegetarian BOOLEAN DEFAULT false;

-- Add index for efficient filtering in lunch lists
CREATE INDEX IF NOT EXISTS idx_ticket_items_is_vegetarian ON ticket_items (is_vegetarian) WHERE is_vegetarian = true;