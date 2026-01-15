-- Add classification column to conversations table for easier filtering
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'other';

-- Add detected_language column
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS detected_language TEXT DEFAULT 'de';

-- Add existing_customer_id for linking matched customers
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS matched_customer_id UUID REFERENCES customers(id);

-- Create index for classification filtering
CREATE INDEX IF NOT EXISTS idx_conversations_classification ON conversations(classification);

-- Create index for matched customers
CREATE INDEX IF NOT EXISTS idx_conversations_matched_customer ON conversations(matched_customer_id);