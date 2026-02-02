-- Set proper sort_order values for existing trainings based on progression
-- This enables automatic progression: lower sort_order → higher sort_order

UPDATE public.group_courses SET sort_order = 1 WHERE name ILIKE '%snow kids%' OR name ILIKE '%village%';
UPDATE public.group_courses SET sort_order = 2 WHERE name ILIKE '%windel%' OR name ILIKE '%wedel%';
UPDATE public.group_courses SET sort_order = 3 WHERE name ILIKE '%blue prince%';
UPDATE public.group_courses SET sort_order = 4 WHERE name ILIKE '%blue king%';
UPDATE public.group_courses SET sort_order = 5 WHERE name ILIKE '%blue star%';
UPDATE public.group_courses SET sort_order = 6 WHERE name ILIKE '%red prince%';
UPDATE public.group_courses SET sort_order = 7 WHERE name ILIKE '%red king%';
UPDATE public.group_courses SET sort_order = 8 WHERE name ILIKE '%red star%';
UPDATE public.group_courses SET sort_order = 9 WHERE name ILIKE '%black prince%';
UPDATE public.group_courses SET sort_order = 10 WHERE name ILIKE '%black academy%' OR name ILIKE '%black star%';

-- Set office/internal courses to high sort_order (not part of progression)
UPDATE public.group_courses SET sort_order = 100 WHERE is_internal = true OR course_type = 'office';