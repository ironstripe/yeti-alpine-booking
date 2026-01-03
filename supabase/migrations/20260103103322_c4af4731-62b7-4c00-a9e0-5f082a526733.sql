-- Seed products table with initial data for booking wizard testing

-- Private Lessons - Ski
INSERT INTO public.products (name, type, duration_minutes, price, description, sort_order) VALUES
('Privatstunde 1h Ski', 'private', 60, 95, 'Private ski lesson - 1 hour', 1),
('Privatstunde 2h Ski', 'private', 120, 180, 'Private ski lesson - 2 hours', 2),
('Privatstunde 4h Ski', 'private', 240, 340, 'Private ski lesson - 4 hours (full day)', 3);

-- Private Lessons - Snowboard  
INSERT INTO public.products (name, type, duration_minutes, price, description, sort_order) VALUES
('Privatstunde 1h Snowboard', 'private', 60, 95, 'Private snowboard lesson - 1 hour', 4),
('Privatstunde 2h Snowboard', 'private', 120, 180, 'Private snowboard lesson - 2 hours', 5),
('Privatstunde 4h Snowboard', 'private', 240, 340, 'Private snowboard lesson - 4 hours (full day)', 6);

-- Group Courses
INSERT INTO public.products (name, type, duration_minutes, price, description, sort_order) VALUES
('Gruppenkurs 1 Tag', 'group', NULL, 85, 'Group course - 1 day', 10),
('Gruppenkurs 2 Tage', 'group', NULL, 160, 'Group course - 2 days', 11),
('Gruppenkurs 3 Tage', 'group', NULL, 225, 'Group course - 3 days', 12),
('Gruppenkurs 4 Tage', 'group', NULL, 280, 'Group course - 4 days', 13),
('Gruppenkurs 5 Tage', 'group', NULL, 325, 'Group course - 5 days', 14);

-- Add-ons
INSERT INTO public.products (name, type, duration_minutes, price, description, sort_order) VALUES
('Mittagsbetreuung', 'lunch', 60, 25, 'Lunch supervision', 20);