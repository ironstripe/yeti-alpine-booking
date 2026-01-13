-- Add product_id to group_courses (nullable for migration)
ALTER TABLE group_courses 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE RESTRICT;

-- Add is_training_product flag to products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS is_training_product BOOLEAN DEFAULT false;

-- Mark existing group course products as training-linkable
UPDATE products 
SET is_training_product = true 
WHERE type IN ('group', 'group_toddler', 'group_beginner');

-- Create index for the foreign key
CREATE INDEX IF NOT EXISTS idx_group_courses_product ON group_courses(product_id);

-- Link existing trainings to matching products based on price
UPDATE group_courses gc
SET product_id = (
  SELECT p.id FROM products p 
  WHERE p.type = 'group' 
  AND p.is_active = true
  ORDER BY ABS(p.price - gc.price_per_day)
  LIMIT 1
)
WHERE gc.product_id IS NULL;