-- Add specialized group course products
INSERT INTO products (name, type, price, duration_minutes, description, sort_order, is_active) VALUES
  ('Ski Windel-Wedelkurs', 'group_toddler', 85, 120, '3-4 Jahre, nur 10:00-12:00', 15, true),
  ('Ski Swiss Snow Kids Village', 'group_beginner', 85, 240, '4+ Jahre Anfänger, 10:00-12:00 + 14:00-16:00', 16, true),
  ('Mittagsbetreuung', 'lunch', 25, 120, '12:00-14:00 pro Tag', 20, true)
ON CONFLICT DO NOTHING;