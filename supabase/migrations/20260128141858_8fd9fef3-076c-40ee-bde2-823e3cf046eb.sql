-- Add skill_level_id FK column to group_courses for direct 1:1 mapping
ALTER TABLE group_courses 
ADD COLUMN skill_level_id TEXT REFERENCES skill_levels(id);

-- Create index for performance
CREATE INDEX idx_group_courses_skill_level_id ON group_courses(skill_level_id);

-- Populate existing data based on name matching
-- Windel Wedel Kurs
UPDATE group_courses SET skill_level_id = 'ski_windel_wedel' 
WHERE LOWER(name) LIKE '%windel%wedel%' AND discipline = 'ski';

-- Blauer Prinz/Prinzessin
UPDATE group_courses SET skill_level_id = 'ski_blauer_prinz' 
WHERE LOWER(name) LIKE '%blauer prinz%' AND discipline = 'ski';

UPDATE group_courses SET skill_level_id = 'sb_blauer_prinz' 
WHERE LOWER(name) LIKE '%blauer prinz%' AND discipline = 'snowboard';

-- Blauer König/King
UPDATE group_courses SET skill_level_id = 'ski_blauer_koenig' 
WHERE (LOWER(name) LIKE '%blauer k%nig%' OR LOWER(name) LIKE '%blue king%') AND discipline = 'ski';

UPDATE group_courses SET skill_level_id = 'sb_blauer_koenig' 
WHERE (LOWER(name) LIKE '%blauer k%nig%' OR LOWER(name) LIKE '%blue king%') AND discipline = 'snowboard';

-- Blauer Star
UPDATE group_courses SET skill_level_id = 'ski_blauer_star' 
WHERE LOWER(name) LIKE '%blauer star%' AND discipline = 'ski';

UPDATE group_courses SET skill_level_id = 'sb_blauer_star' 
WHERE LOWER(name) LIKE '%blauer star%' AND discipline = 'snowboard';

-- Roter/Red Prinz/Prince
UPDATE group_courses SET skill_level_id = 'ski_roter_prinz' 
WHERE (LOWER(name) LIKE '%roter prinz%' OR LOWER(name) LIKE '%red prince%') AND discipline = 'ski';

UPDATE group_courses SET skill_level_id = 'sb_roter_prinz' 
WHERE (LOWER(name) LIKE '%roter prinz%' OR LOWER(name) LIKE '%red prince%') AND discipline = 'snowboard';

-- Roter/Red König/King
UPDATE group_courses SET skill_level_id = 'ski_roter_koenig' 
WHERE (LOWER(name) LIKE '%roter k%nig%' OR LOWER(name) LIKE '%red king%') AND discipline = 'ski';

UPDATE group_courses SET skill_level_id = 'sb_roter_koenig' 
WHERE (LOWER(name) LIKE '%roter k%nig%' OR LOWER(name) LIKE '%red king%') AND discipline = 'snowboard';

-- Roter/Red Star
UPDATE group_courses SET skill_level_id = 'ski_roter_star' 
WHERE (LOWER(name) LIKE '%roter star%' OR LOWER(name) LIKE '%red star%') AND discipline = 'ski';

UPDATE group_courses SET skill_level_id = 'sb_roter_star' 
WHERE (LOWER(name) LIKE '%roter star%' OR LOWER(name) LIKE '%red star%') AND discipline = 'snowboard';

-- Schwarzer/Black Prinz/Prince
UPDATE group_courses SET skill_level_id = 'ski_schwarzer_prinz' 
WHERE (LOWER(name) LIKE '%schwarzer prinz%' OR LOWER(name) LIKE '%black prince%') AND discipline = 'ski';

UPDATE group_courses SET skill_level_id = 'sb_schwarzer_prinz' 
WHERE (LOWER(name) LIKE '%schwarzer prinz%' OR LOWER(name) LIKE '%black prince%') AND discipline = 'snowboard';

-- Schwarzer/Black König/King
UPDATE group_courses SET skill_level_id = 'ski_schwarzer_koenig' 
WHERE (LOWER(name) LIKE '%schwarzer k%nig%' OR LOWER(name) LIKE '%black king%') AND discipline = 'ski';

UPDATE group_courses SET skill_level_id = 'sb_schwarzer_koenig' 
WHERE (LOWER(name) LIKE '%schwarzer k%nig%' OR LOWER(name) LIKE '%black king%') AND discipline = 'snowboard';