-- =============================================
-- SKILL LEVELS SYSTEM - COMPREHENSIVE MIGRATION
-- =============================================

-- 1. Create skill_levels table
CREATE TABLE IF NOT EXISTS skill_levels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('ski', 'snowboard')),
  target_group TEXT NOT NULL CHECK (target_group IN ('child', 'adult')),
  color TEXT CHECK (color IN ('green', 'blue', 'red', 'black')),
  sort_order INTEGER NOT NULL,
  description TEXT,
  short_description TEXT,
  next_level_id TEXT REFERENCES skill_levels(id),
  min_age INTEGER,
  max_age INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_skill_levels_discipline ON skill_levels(discipline);
CREATE INDEX IF NOT EXISTS idx_skill_levels_target_group ON skill_levels(target_group);
CREATE INDEX IF NOT EXISTS idx_skill_levels_sort ON skill_levels(sort_order);

-- 2. Create participant_level_history table
CREATE TABLE IF NOT EXISTS participant_level_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES customer_participants(id) ON DELETE CASCADE,
  skill_level_id TEXT NOT NULL REFERENCES skill_levels(id),
  discipline TEXT NOT NULL CHECK (discipline IN ('ski', 'snowboard')),
  season TEXT NOT NULL,
  assessed_at DATE DEFAULT CURRENT_DATE,
  assessed_by UUID REFERENCES instructors(id),
  source TEXT CHECK (source IN ('booking', 'assessment', 'manual', 'migration')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(participant_id, discipline, season)
);

CREATE INDEX IF NOT EXISTS idx_level_history_participant ON participant_level_history(participant_id);
CREATE INDEX IF NOT EXISTS idx_level_history_season ON participant_level_history(season);

-- 3. Add new columns to customer_participants
ALTER TABLE customer_participants 
ADD COLUMN IF NOT EXISTS current_ski_level_id TEXT REFERENCES skill_levels(id),
ADD COLUMN IF NOT EXISTS current_snowboard_level_id TEXT REFERENCES skill_levels(id),
ADD COLUMN IF NOT EXISTS self_assessed_ski_level TEXT CHECK (self_assessed_ski_level IN ('green', 'blue', 'red', 'black')),
ADD COLUMN IF NOT EXISTS self_assessed_snowboard_level TEXT CHECK (self_assessed_snowboard_level IN ('green', 'blue', 'red', 'black'));

-- 4. Enable RLS on skill_levels
ALTER TABLE skill_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view skill_levels" ON skill_levels
FOR SELECT USING (true);

CREATE POLICY "Admin can manage skill_levels" ON skill_levels
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Enable RLS on participant_level_history
ALTER TABLE participant_level_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view level_history" ON participant_level_history
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert level_history" ON participant_level_history
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update level_history" ON participant_level_history
FOR UPDATE USING (auth.role() = 'authenticated');

-- =============================================
-- SEED DATA: SKI LEVELS FOR CHILDREN (10 levels)
-- =============================================

INSERT INTO skill_levels (id, name, discipline, target_group, color, sort_order, short_description, description, next_level_id, min_age, max_age) VALUES
('ski_windel_wedel', 'Windel Wedel Kurs', 'ski', 'child', NULL, 1, 
 'Kleinkinder, erste Schneeerfahrung',
 'Spielerisches Kennenlernen von Ski und Schnee für die Kleinsten',
 'ski_snow_kids', 3, 4),

('ski_snow_kids', 'Swiss Snow Kids', 'ski', 'child', NULL, 2,
 'Die Geschichte von Snowli, erste Schritte',
 'Kennenlernen von Ski und Schnee. Gehen, Aufsteigen (Wenden). Falllinienfahren parallel und Bremsen. Erste Richtungsänderungen aus der Falllinie.',
 'ski_blauer_prinz', 4, 6),

('ski_blauer_prinz', 'Blauer Prinz/Prinzessin', 'ski', 'child', 'blue', 3,
 'Pflugdrehen, Treppen-/Scherschritt',
 'Info über die Ausrüstung. Aufsteigen mit Treppen- und Scherschritt. Gleiten und Bremsen im Pflug. Fahren in paralleler Skistellung mit Umsteigen und Tricks. Pflugdrehen.',
 'ski_blauer_koenig', NULL, NULL),

('ski_blauer_koenig', 'Blauer König/Königin', 'ski', 'child', 'blue', 4,
 'Liftfahren, Pflugschwingen blaue Piste',
 'Info über die Benutzung der Transportanlagen (sicheres Liftfahren). Schrägfahren und Tricks. Seitrutschen. Paralleles Befahren von einfachen Wellen und Sprüngen. Pflugschwingen auf einfacher blauer Piste.',
 'ski_blauer_star', NULL, NULL),

('ski_blauer_star', 'Blauer Star', 'ski', 'child', 'blue', 5,
 'FIS-Regeln, Parcours, Switchfahren',
 'Info über das Verhalten auf Pisten (FIS-Regeln). Schwingen im Mini-Stangenwald und Parcours. Wellen- und Muldenfahren. Switchfahren in V-Stellung mit Richtungsänderungen. Pflugschwingen auf abwechslungsreicher blauer Piste.',
 'ski_roter_prinz', NULL, NULL),

('ski_roter_prinz', 'Roter Prinz/Prinzessin', 'ski', 'child', 'red', 6,
 'Parallelschwingen gerutscht',
 'Info über Aufwärmen (warm-up). Bremsen parallel. Bogentreten auf einfacher Piste. Walzer. Parallelschwingen (gerutscht).',
 'ski_roter_koenig', NULL, NULL),

('ski_roter_koenig', 'Roter König/Königin', 'ski', 'child', 'red', 7,
 'Snowpark, Kurzschwingen, Basic Air',
 'Info über das Verhalten im Snowpark. Kurzschwingen auf einfacher Piste. Schlittschuhschritt in der Ebene. Basic Air (Small Kicker). Parallelschwingen mit verschiedenen Radien.',
 'ski_roter_star', NULL, NULL),

('ski_roter_star', 'Roter Star', 'ski', 'child', 'red', 8,
 'Kurzschwingen mittelschwere Piste',
 'Info über Natur, Wald und Landschaft. Parallelschwingen im Stangencouloir und Parcours. Parallelschwung "Switch" (gerutscht). Einbeinschwingen auf einfacher Piste. Kurzschwingen auf mittelschwerer Piste.',
 'ski_schwarzer_prinz', NULL, NULL),

('ski_schwarzer_prinz', 'Schwarzer Prinz/Prinzessin', 'ski', 'child', 'black', 9,
 'Carven, unpräparierter Schnee',
 'Info über Materialpräparation. Kurzschwingen mit Stockeinsatz auf schwieriger Piste. Springen Straights / Fifty-Fifty über Box. Parallelschwingen in unpräpariertem Schnee. Carveschwung (geschnittene Parallelschwünge) auf breiter, einfacher Piste.',
 'ski_academy', NULL, NULL),

('ski_academy', 'Academy Ski', 'ski', 'child', 'black', 10,
 'Fortgeschrittene Technik',
 'Höchstes Niveau für Kinder. Perfektionierung aller Techniken.',
 NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SEED DATA: SNOWBOARD LEVELS FOR CHILDREN (8 levels)
-- =============================================

INSERT INTO skill_levels (id, name, discipline, target_group, color, sort_order, short_description, description, next_level_id, min_age, max_age) VALUES
('sb_snow_kids', 'Swiss Snow Kids', 'snowboard', 'child', NULL, 1,
 'One-Foot, Fullbase, Gerutscht',
 'Info über Ausrüstung. One-Foot-Fahren in der Ebene. Fullbase-Fahren in einfachem Gelände. Gerutscht-Fahren in der Falllinie. Fullbase- zu Gerutscht-Fahren in einfachem Gelände.',
 'sb_blauer_prinz', NULL, NULL),

('sb_blauer_prinz', 'Blauer Prinz/Prinzessin', 'snowboard', 'child', 'blue', 2,
 'FIS-Regeln, Traverse, gerutschte Schwünge',
 'Info über das Verhalten auf Pisten (FIS-Regeln). Gerutscht-Fahren in der Traverse. Gerutscht- zu Fullbase-Fahren. Übungslift Fahren. Gerutschte Schwünge.',
 'sb_blauer_koenig', NULL, NULL),

('sb_blauer_koenig', 'Blauer König/Königin', 'snowboard', 'child', 'blue', 3,
 'Drehschwünge, Walzer, Wheelie',
 'Info über das Aufwärmen (warm-up). Drehschwünge. Walzer. Wheelie. Beidbeiniger Absprung auf der Piste.',
 'sb_blauer_star', NULL, NULL),

('sb_blauer_star', 'Blauer Star', 'snowboard', 'child', 'blue', 4,
 'Switch, Fifty-Fifty Box',
 'Info über das Verhalten im Snowpark. Switch-Schwünge. Speedcheck. Fifty-Fifty über eine einfache Box. Sprünge über kleine Sprunganlagen.',
 'sb_roter_prinz', NULL, NULL),

('sb_roter_prinz', 'Roter Prinz/Prinzessin', 'snowboard', 'child', 'red', 5,
 'Ollie, 180 auf Piste',
 'Kleines Freestyle-Lexikon. Streck- und Beugeschwünge. Powerslide. Ollie/N''Ollie auf der Piste. 180 auf der Piste.',
 'sb_roter_koenig', NULL, NULL),

('sb_roter_koenig', 'Roter König/Königin', 'snowboard', 'child', 'red', 6,
 'Gecarvte Schwünge, Basic Air',
 'Info über Natur, Wald und Landschaft. Gecarvte Schwünge. Slide auf der Piste. Ollie/N''Ollie 180 auf der Piste. Basic Air.',
 'sb_roter_star', NULL, NULL),

('sb_roter_star', 'Roter Star', 'snowboard', 'child', 'red', 7,
 'Unpräpariertes Gelände, Boardslide',
 'Info über die Swiss Snow Academy. Fahren in unpräpariertem Gelände. Frontside Noseturn. Backside Boardslide über eine Box. Straight Air.',
 'sb_academy', NULL, NULL),

('sb_academy', 'Academy Snowboard', 'snowboard', 'child', 'black', 8,
 'Fortgeschrittene Technik',
 'Höchstes Niveau für Kinder. Perfektionierung aller Techniken.',
 NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SEED DATA: ADULT LEVELS (4 per discipline = 8 total)
-- =============================================

INSERT INTO skill_levels (id, name, discipline, target_group, color, sort_order, short_description, description, next_level_id, min_age, max_age) VALUES
-- Ski Adults
('ski_adult_green', 'Anfänger', 'ski', 'adult', 'green', 1,
 'Kompletter Anfänger',
 'Keine oder sehr wenig Erfahrung auf Skiern. Erste Schritte auf dem Schnee.',
 'ski_adult_blue', 16, NULL),

('ski_adult_blue', 'Fortgeschritten', 'ski', 'adult', 'blue', 2,
 'Fährt blaue Pisten sicher',
 'Sicheres Fahren auf blauen (einfachen) Pisten. Pflug- oder Paralleltechnik.',
 'ski_adult_red', 16, NULL),

('ski_adult_red', 'Geübt', 'ski', 'adult', 'red', 3,
 'Fährt rote Pisten sicher',
 'Sicheres Fahren auf roten (mittelschweren) Pisten. Paralleltechnik.',
 'ski_adult_black', 16, NULL),

('ski_adult_black', 'Experte', 'ski', 'adult', 'black', 4,
 'Fährt schwarze Pisten sicher',
 'Sicheres Fahren auf schwarzen (schweren) Pisten. Alle Schneebedingungen.',
 NULL, 16, NULL),

-- Snowboard Adults
('sb_adult_green', 'Anfänger', 'snowboard', 'adult', 'green', 1,
 'Kompletter Anfänger',
 'Keine oder sehr wenig Erfahrung auf dem Snowboard. Erste Schritte auf dem Schnee.',
 'sb_adult_blue', 16, NULL),

('sb_adult_blue', 'Fortgeschritten', 'snowboard', 'adult', 'blue', 2,
 'Fährt blaue Pisten sicher',
 'Sicheres Fahren auf blauen (einfachen) Pisten.',
 'sb_adult_red', 16, NULL),

('sb_adult_red', 'Geübt', 'snowboard', 'adult', 'red', 3,
 'Fährt rote Pisten sicher',
 'Sicheres Fahren auf roten (mittelschweren) Pisten.',
 'sb_adult_black', 16, NULL),

('sb_adult_black', 'Experte', 'snowboard', 'adult', 'black', 4,
 'Fährt schwarze Pisten sicher',
 'Sicheres Fahren auf schwarzen (schweren) Pisten. Alle Schneebedingungen.',
 NULL, 16, NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- DATA MIGRATION: Migrate existing participant levels
-- =============================================

-- Migrate ski levels (where sport is 'ski' or NULL, default to ski)
UPDATE customer_participants
SET current_ski_level_id = CASE level_current_season
  WHEN 'anfaenger' THEN 'ski_snow_kids'
  WHEN 'snow_kids_village' THEN 'ski_snow_kids'
  WHEN 'blue_prince' THEN 'ski_blauer_prinz'
  WHEN 'blue_star' THEN 'ski_blauer_star'
  WHEN 'blue_king' THEN 'ski_blauer_koenig'
  WHEN 'red_prince' THEN 'ski_roter_prinz'
  WHEN 'red_star' THEN 'ski_roter_star'
  WHEN 'red_king' THEN 'ski_roter_koenig'
  WHEN 'black_prince' THEN 'ski_schwarzer_prinz'
  WHEN 'black_king' THEN 'ski_academy'
  ELSE NULL
END
WHERE (sport = 'ski' OR sport IS NULL) AND level_current_season IS NOT NULL;

-- Migrate snowboard levels
UPDATE customer_participants
SET current_snowboard_level_id = CASE level_current_season
  WHEN 'anfaenger' THEN 'sb_snow_kids'
  WHEN 'snow_kids_village' THEN 'sb_snow_kids'
  WHEN 'blue_prince' THEN 'sb_blauer_prinz'
  WHEN 'blue_star' THEN 'sb_blauer_star'
  WHEN 'blue_king' THEN 'sb_blauer_koenig'
  WHEN 'red_prince' THEN 'sb_roter_prinz'
  WHEN 'red_star' THEN 'sb_roter_star'
  WHEN 'red_king' THEN 'sb_roter_koenig'
  WHEN 'black_king' THEN 'sb_academy'
  ELSE NULL
END
WHERE sport = 'snowboard' AND level_current_season IS NOT NULL;