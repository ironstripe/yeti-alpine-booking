
# Skill-Level-System – Data Model and Migration Plan

## Executive Summary

This plan implements a comprehensive skill level system for YETY ski school booking, distinguishing between:
1. **Children (Gruppenkurs + Privatkurs)**: Specific Swiss Snow League progression levels
2. **Adults (Privatkurs only)**: Simple color-based self-assessment (Green/Blue/Red/Black)

---

## Current State Analysis

### What Exists Today

**Customer Participants Table** (`customer_participants`):
- `level_last_season` - text, nullable
- `level_current_season` - text, nullable  
- `sport` - text, nullable (ski/snowboard)

**Group Courses Table** (`group_courses`):
- `skill_level` - text (beginner/intermediate/advanced)
- `discipline` - text (ski/snowboard)
- `min_age` / `max_age` - integer, nullable

**Current Level Constants** (`src/lib/level-utils.ts` and `src/lib/participant-utils.ts`):
- Hardcoded arrays with mixed/incomplete levels
- `LEVEL_HIERARCHY`: anfaenger → blue_prince → blue_king → red_prince → red_king → black_prince → black_king
- `LEVEL_OPTIONS`: snow_kids_village, blue_prince, blue_star, blue_king, red_prince, red_star, red_king

**Key Issues**:
1. Levels are scattered across multiple files with inconsistencies
2. No database-backed skill level definitions
3. No distinction between ski and snowboard levels
4. No adult-specific self-assessment levels
5. Missing levels from Swiss Snow League curriculum (Windel Wedel, Academy, etc.)

---

## Implementation Plan

### Part 1: Database Schema

#### 1.1 Create `skill_levels` Table

```sql
CREATE TABLE skill_levels (
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

CREATE INDEX idx_skill_levels_discipline ON skill_levels(discipline);
CREATE INDEX idx_skill_levels_target_group ON skill_levels(target_group);
CREATE INDEX idx_skill_levels_sort ON skill_levels(sort_order);
```

#### 1.2 Update `customer_participants` Table

Add new columns for discipline-specific tracked levels plus adult self-assessment:

```sql
ALTER TABLE customer_participants 
ADD COLUMN IF NOT EXISTS current_ski_level_id TEXT REFERENCES skill_levels(id),
ADD COLUMN IF NOT EXISTS current_snowboard_level_id TEXT REFERENCES skill_levels(id),
ADD COLUMN IF NOT EXISTS self_assessed_ski_level TEXT CHECK (self_assessed_ski_level IN ('green', 'blue', 'red', 'black')),
ADD COLUMN IF NOT EXISTS self_assessed_snowboard_level TEXT CHECK (self_assessed_snowboard_level IN ('green', 'blue', 'red', 'black'));
```

Note: Existing `level_current_season`, `level_last_season`, and `sport` columns are kept for backward compatibility during migration.

#### 1.3 Create Level History Table

```sql
CREATE TABLE participant_level_history (
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

CREATE INDEX idx_level_history_participant ON participant_level_history(participant_id);
CREATE INDEX idx_level_history_season ON participant_level_history(season);
```

#### 1.4 RLS Policies

```sql
-- skill_levels (read-only for most users)
ALTER TABLE skill_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view skill_levels" ON skill_levels
FOR SELECT USING (true);

CREATE POLICY "Admin can manage skill_levels" ON skill_levels
FOR ALL USING (has_role(auth.uid(), 'admin'));

-- participant_level_history
ALTER TABLE participant_level_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view level_history" ON participant_level_history
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert level_history" ON participant_level_history
FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```

---

### Part 2: Seed Data

#### 2.1 Ski Levels for Children (10 levels)

| ID | Name | Color | Age | Description |
|----|------|-------|-----|-------------|
| `ski_windel_wedel` | Windel Wedel Kurs | - | 3-4 | Kleinkinder, erste Schneeerfahrung |
| `ski_snow_kids` | Swiss Snow Kids | - | 4-6 | Die Geschichte von Snowli, erste Schritte |
| `ski_blauer_prinz` | Blauer Prinz/Prinzessin | blue | - | Pflugdrehen, Treppen-/Scherschritt |
| `ski_blauer_koenig` | Blauer König/Königin | blue | - | Liftfahren, Pflugschwingen blaue Piste |
| `ski_blauer_star` | Blauer Star | blue | - | FIS-Regeln, Parcours, Switchfahren |
| `ski_roter_prinz` | Roter Prinz/Prinzessin | red | - | Parallelschwingen gerutscht |
| `ski_roter_koenig` | Roter König/Königin | red | - | Snowpark, Kurzschwingen, Basic Air |
| `ski_roter_star` | Roter Star | red | - | Kurzschwingen mittelschwere Piste |
| `ski_schwarzer_prinz` | Schwarzer Prinz/Prinzessin | black | - | Carven, unpräparierter Schnee |
| `ski_academy` | Academy Ski | black | - | Fortgeschrittene Technik |

#### 2.2 Snowboard Levels for Children (8 levels)

| ID | Name | Color | Description |
|----|------|-------|-------------|
| `sb_snow_kids` | Swiss Snow Kids | - | One-Foot, Fullbase, Gerutscht |
| `sb_blauer_prinz` | Blauer Prinz/Prinzessin | blue | FIS-Regeln, Traverse, gerutschte Schwünge |
| `sb_blauer_koenig` | Blauer König/Königin | blue | Drehschwünge, Walzer, Wheelie |
| `sb_blauer_star` | Blauer Star | blue | Switch, Fifty-Fifty Box |
| `sb_roter_prinz` | Roter Prinz/Prinzessin | red | Ollie, 180 auf Piste |
| `sb_roter_koenig` | Roter König/Königin | red | Gecarvte Schwünge, Basic Air |
| `sb_roter_star` | Roter Star | red | Unpräpariertes Gelände, Boardslide |
| `sb_academy` | Academy Snowboard | black | Fortgeschrittene Technik |

#### 2.3 Adult Levels (4 per discipline)

| ID | Name | Color | Description |
|----|------|-------|-------------|
| `ski_adult_green` | Anfänger | green | Kompletter Anfänger |
| `ski_adult_blue` | Fortgeschritten | blue | Fährt blaue Pisten sicher |
| `ski_adult_red` | Geübt | red | Fährt rote Pisten sicher |
| `ski_adult_black` | Experte | black | Fährt schwarze Pisten sicher |
| `sb_adult_green` | Anfänger | green | Kompletter Anfänger |
| `sb_adult_blue` | Fortgeschritten | blue | Fährt blaue Pisten sicher |
| `sb_adult_red` | Geübt | red | Fährt rote Pisten sicher |
| `sb_adult_black` | Experte | black | Fährt schwarze Pisten sicher |

---

### Part 3: TypeScript Implementation

#### 3.1 New Types File: `src/types/skill-levels.ts`

```typescript
export type Discipline = 'ski' | 'snowboard';
export type TargetGroup = 'child' | 'adult';
export type SkillColor = 'green' | 'blue' | 'red' | 'black';
export type AdultSelfAssessment = 'green' | 'blue' | 'red' | 'black';

export interface SkillLevel {
  id: string;
  name: string;
  discipline: Discipline;
  target_group: TargetGroup;
  color: SkillColor | null;
  sort_order: number;
  description: string | null;
  short_description: string | null;
  next_level_id: string | null;
  min_age: number | null;
  max_age: number | null;
  is_active: boolean;
}

export interface ParticipantWithLevels {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string | null;
  current_ski_level_id: string | null;
  current_snowboard_level_id: string | null;
  self_assessed_ski_level: AdultSelfAssessment | null;
  self_assessed_snowboard_level: AdultSelfAssessment | null;
}
```

#### 3.2 New Query Functions: `src/lib/skill-levels.ts`

```typescript
// Get all skill levels for a discipline and target group
export async function getSkillLevels(
  discipline: Discipline,
  targetGroup: TargetGroup
): Promise<SkillLevel[]>

// Get suggested next level for a participant
export async function getSuggestedLevel(
  currentLevelId: string | null,
  discipline: Discipline
): Promise<{ suggested: SkillLevel | null; fallback: SkillLevel | null }>

// Get appropriate levels for booking based on participant and course type
export async function getLevelsForBooking(
  participant: ParticipantWithLevels,
  discipline: Discipline,
  isGroupCourse: boolean
): Promise<{
  availableLevels: SkillLevel[];
  suggestedLevel: SkillLevel | null;
  fallbackLevel: SkillLevel | null;
}>
```

#### 3.3 New Hook: `src/hooks/useSkillLevels.ts`

```typescript
export function useSkillLevels(discipline: Discipline, targetGroup: TargetGroup)
export function useBookingLevels(participant, discipline, isGroupCourse)
```

---

### Part 4: UI Components

#### 4.1 Level Selector Component: `src/components/booking/LevelSelector.tsx`

Features:
- Dropdown with all appropriate levels for participant
- Color-coded level indicators (blue/red/black badges)
- Suggestion banner: "Vorschlag basierend auf Vorjahr: {level}"
- Tooltip with full level description
- Auto-selects suggested level if none selected

#### 4.2 Adult Self-Assessment: `src/components/booking/AdultLevelAssessment.tsx`

Features:
- Radio group with 4 color options (green/blue/red/black)
- Visual piste color indicators
- Clear German labels and descriptions
- For private lessons only (adults cannot book group courses)

---

### Part 5: Update Existing Components

#### Files to Modify:

| File | Changes |
|------|---------|
| `src/lib/level-utils.ts` | Add mapping from old level IDs to new skill_level IDs; update `mapLevelToCourseSkill` |
| `src/lib/participant-utils.ts` | Replace hardcoded `LEVEL_OPTIONS` with database-backed query |
| `src/components/customers/detail/ParticipantCard.tsx` | Use new `LevelSelector` component |
| `src/components/bookings/wizard/ParticipantListCard.tsx` | Use new `LevelSelector` for inline add |
| `src/components/bookings/wizard/ParticipantBookingCard.tsx` | Show level with new styling |
| `src/contexts/BookingWizardContext.tsx` | Add discipline-specific level fields to `SelectedParticipant` |
| `src/hooks/useCustomerDetail.ts` | Include new level columns in query |
| `src/hooks/useParticipants.ts` | Update create/update mutations for new columns |

---

### Part 6: Data Migration

#### 6.1 Mapping Old Levels to New IDs

| Old Value | New Ski ID | New Snowboard ID |
|-----------|------------|------------------|
| `anfaenger` | `ski_snow_kids` | `sb_snow_kids` |
| `snow_kids_village` | `ski_snow_kids` | `sb_snow_kids` |
| `blue_prince` | `ski_blauer_prinz` | `sb_blauer_prinz` |
| `blue_star` | `ski_blauer_star` | `sb_blauer_star` |
| `blue_king` | `ski_blauer_koenig` | `sb_blauer_koenig` |
| `red_prince` | `ski_roter_prinz` | `sb_roter_prinz` |
| `red_star` | `ski_roter_star` | `sb_roter_star` |
| `red_king` | `ski_roter_koenig` | `sb_roter_koenig` |
| `black_prince` | `ski_schwarzer_prinz` | - |
| `black_king` | `ski_academy` | `sb_academy` |

#### 6.2 Migration Script

```sql
-- Migrate existing participant levels
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
WHERE sport = 'ski' OR sport IS NULL;

-- Similar for snowboard...
```

---

### Part 7: Update Group Course Mapping

The `group_courses.skill_level` field uses `beginner/intermediate/advanced`. We need a mapping function:

```typescript
export function mapSkillLevelToGroupCourseSkill(levelId: string): string {
  const beginnerLevels = ['ski_windel_wedel', 'ski_snow_kids', 'ski_blauer_prinz', 'sb_snow_kids', 'sb_blauer_prinz'];
  const intermediateLevels = ['ski_blauer_koenig', 'ski_blauer_star', 'sb_blauer_koenig', 'sb_blauer_star'];
  
  if (beginnerLevels.includes(levelId)) return 'beginner';
  if (intermediateLevels.includes(levelId)) return 'intermediate';
  return 'advanced';
}
```

---

## Deliverables Summary

| Category | Items |
|----------|-------|
| **Database** | 1 new table (`skill_levels`), 1 new table (`participant_level_history`), 4 new columns on `customer_participants` |
| **Seed Data** | 26 skill levels (10 ski child + 8 snowboard child + 8 adult) |
| **Types** | 1 new file (`src/types/skill-levels.ts`) |
| **Queries** | 1 new file (`src/lib/skill-levels.ts`) with query functions |
| **Hooks** | 1 new file (`src/hooks/useSkillLevels.ts`) |
| **UI Components** | 2 new components (`LevelSelector`, `AdultLevelAssessment`) |
| **Migrations** | Data migration for existing participants |
| **Updates** | 8+ existing files to integrate new system |

---

## Backward Compatibility

1. Old level columns (`level_current_season`, `level_last_season`) are kept
2. Existing bookings continue to work with old values
3. New bookings use the new `skill_level_id` system
4. Utility functions gracefully handle both old and new formats
5. UI displays correctly for both old and new data

---

## Constraints Enforced

1. Adults cannot book group courses (validation in booking wizard)
2. Children always use detailed progression levels
3. Self-assessment only for adults without tracked level history
4. Level history tracked for analytics and progression insights
