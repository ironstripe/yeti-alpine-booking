-- Step 1: Nullify product references in group_courses
UPDATE group_courses SET product_id = NULL;

-- Step 2: Clean up product data
DELETE FROM product_price_tiers;
DELETE FROM products;