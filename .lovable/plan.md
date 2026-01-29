
# Database Extension for Advanced User Management

## Overview

This migration will create a flexible system for managing instructor types (teacher vs assistant) and their teaching capabilities/qualifications.

## Current State Analysis

| Component | Status |
|-----------|--------|
| `instructors` table | Exists with 24 columns |
| `instructor_type` column | Does not exist |
| `capabilities` table | Does not exist |
| `instructor_capabilities` join table | Does not exist |
| `instructor_role_type` ENUM | Does not exist |
| Existing ENUM (`app_role`) | Exists: `admin`, `office`, `teacher` |

## Changes to Implement

### 1. Create `instructor_role_type` ENUM

New ENUM with two values:
- `teacher` (main instructor/group leader)
- `assistant` (assistant instructor)

### 2. Add `instructor_type` Column to `instructors` Table

| Property | Value |
|----------|-------|
| Column name | `instructor_type` |
| Type | `instructor_role_type` |
| Default | `teacher` |
| Nullable | NOT NULL |

### 3. Create `capabilities` Table

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PRIMARY KEY, gen_random_uuid() |
| `name` | TEXT | NOT NULL, UNIQUE |
| `category` | TEXT | Nullable (for filtering) |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |

### 4. Create `instructor_capabilities` Join Table

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PRIMARY KEY, gen_random_uuid() |
| `instructor_id` | UUID | REFERENCES instructors(id) ON DELETE CASCADE |
| `capability_id` | UUID | REFERENCES capabilities(id) ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| | | UNIQUE(instructor_id, capability_id) |

### 5. Populate Capabilities

25 capabilities to be inserted, organized by category:

**Ski (15 capabilities)**
- Windel-Wedelkurs
- Swiss Snow Kids Village
- Blauer Prinz/Prinzessin
- Blauer König/Königin
- Blauer Star
- Roter Prinz/Prinzessin
- Roter König/Königin
- Roter Star
- Schwarzer Prinz/Prinzessin
- Schwarzer König/Königin
- Swiss Snow Academy
- Erwachsene Anfänger
- Erwachsene Fortgeschritten
- Erwachsene Wiedereinsteiger
- Kinder Fortgeschritten

**Snowboard (2 capabilities)**
- Anfänger
- Fortgeschritten

**Betreuung (1 capability)**
- Mittagsbetreuung

**Gästerennen (4 capabilities)**
- SKI-Rennen Kinder
- SB-Rennen Kinder
- SKI-Rennen Erwachsene
- SB-Rennen Erwachsene

**Skitage (2 capabilities)**
- Anfänger
- Fortgeschritten

**Jugendhaus (1 capability)**
- Anfänger

---

## Technical Details

### RLS Policies

Both new tables need RLS policies:

**`capabilities` table:**
- Read access: Authenticated users (all staff need to see available capabilities)
- Write access: Admin/Office only (manage capability list)

**`instructor_capabilities` table:**
- Read access: Authenticated users (needed for scheduling)
- Write access: Admin/Office only (assign capabilities to instructors)

### Migration SQL Structure

```text
-- 1. Create ENUM (idempotent with DO block)
DO $$ BEGIN
  CREATE TYPE instructor_role_type AS ENUM ('teacher', 'assistant');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add column to instructors (idempotent)
ALTER TABLE instructors 
ADD COLUMN IF NOT EXISTS instructor_type instructor_role_type NOT NULL DEFAULT 'teacher';

-- 3. Create capabilities table
CREATE TABLE IF NOT EXISTS capabilities (...);

-- 4. Create instructor_capabilities join table
CREATE TABLE IF NOT EXISTS instructor_capabilities (...);

-- 5. Insert capabilities (ON CONFLICT DO NOTHING for idempotency)
INSERT INTO capabilities (name, category) VALUES 
  ('Ski Windel-Wedelkurs', 'Ski'),
  ...
ON CONFLICT (name) DO NOTHING;

-- 6. Enable RLS and create policies
ALTER TABLE capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructor_capabilities ENABLE ROW LEVEL SECURITY;
```

---

## File Changes Summary

| File | Action |
|------|--------|
| `supabase/migrations/[timestamp]_instructor_capabilities.sql` | Create new migration file |

No code changes needed immediately - the TypeScript types will auto-regenerate after migration runs.

---

## Future Code Integration Points

After migration, these components will need updates to use the new fields:

1. **Instructor Detail Page** - Display/edit `instructor_type` and capabilities
2. **Instructor Filters** - Filter by type (teacher/assistant) and capabilities
3. **Group Course Assignment** - Use capabilities to suggest qualified instructors
4. **Instructor Forms** - Add capability selection checkboxes

---

## Testing Verification

After running the migration, verify:

1. `SELECT * FROM pg_type WHERE typname = 'instructor_role_type'` returns the ENUM
2. `\d instructors` shows `instructor_type` column with default `teacher`
3. `SELECT COUNT(*) FROM capabilities` returns 25
4. Can insert into `instructor_capabilities` linking an instructor to a capability
5. Deleting an instructor cascades to remove their capability assignments
6. Deleting a capability cascades to remove related instructor assignments
