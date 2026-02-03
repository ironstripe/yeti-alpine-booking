
# Recurring Time Blocks for Instructors

## Overview

Extend the instructor availability system to support recurring time blocks (e.g., daily lunch breaks, morning-only availability) with preset templates, conflict checking, and integration with the existing approval workflow.

## Database Changes

### 1. New Table: `instructor_recurring_blocks`

```sql
CREATE TABLE instructor_recurring_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  
  -- Time window
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Recurrence pattern (0=Sun, 1=Mon, ..., 6=Sat)
  weekdays INTEGER[] NOT NULL,
  
  -- Validity period
  valid_from DATE NOT NULL,
  valid_until DATE,  -- NULL = until season end
  
  -- Metadata
  reason TEXT,
  preset_type TEXT,  -- 'lunch', 'morning_only', 'afternoon_only', 'custom'
  
  -- Approval workflow (matching absences pattern)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_recurring_blocks_instructor ON instructor_recurring_blocks(instructor_id);
CREATE INDEX idx_recurring_blocks_status ON instructor_recurring_blocks(status);
CREATE INDEX idx_recurring_blocks_weekdays ON instructor_recurring_blocks USING GIN (weekdays);
```

### 2. Conflict Check Function

```sql
CREATE OR REPLACE FUNCTION check_recurring_block_conflicts(
  p_instructor_id UUID,
  p_start_time TIME,
  p_end_time TIME,
  p_weekdays INTEGER[],
  p_valid_from DATE,
  p_valid_until DATE
)
RETURNS TABLE (
  booking_id UUID,
  booking_date DATE,
  time_start TIME,
  time_end TIME,
  participant_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ti.id,
    ti.date,
    ti.time_start::TIME,
    ti.time_end::TIME,
    COALESCE(cp.first_name || ' ' || cp.last_name, 'Unbekannt')
  FROM ticket_items ti
  LEFT JOIN customer_participants cp ON cp.id = ti.participant_id
  WHERE ti.instructor_id = p_instructor_id
    AND ti.date >= p_valid_from
    AND (p_valid_until IS NULL OR ti.date <= p_valid_until)
    AND EXTRACT(DOW FROM ti.date)::INTEGER = ANY(p_weekdays)
    AND ti.time_start::TIME < p_end_time
    AND ti.time_end::TIME > p_start_time
    AND ti.status NOT IN ('cancelled');
END;
$$ LANGUAGE plpgsql;
```

### 3. RLS Policies

```sql
-- Instructors can view/manage their own blocks
ALTER TABLE instructor_recurring_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Instructors can view their own blocks" ON instructor_recurring_blocks
  FOR SELECT USING (
    instructor_id IN (SELECT id FROM instructors WHERE email = auth.jwt()->>'email')
  );

CREATE POLICY "Instructors can create their own blocks" ON instructor_recurring_blocks
  FOR INSERT WITH CHECK (
    instructor_id IN (SELECT id FROM instructors WHERE email = auth.jwt()->>'email')
  );

-- Admins can manage all
CREATE POLICY "Admins can manage all blocks" ON instructor_recurring_blocks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
```

## File Changes

### 1. New Components

| File | Purpose |
|------|---------|
| `src/components/instructor/RecurringBlocksTab.tsx` | Main tab with preset buttons and blocks list |
| `src/components/instructor/RecurringBlockDialog.tsx` | Form dialog with conflict checking |

### 2. New Hooks

| File | Purpose |
|------|---------|
| `src/hooks/useRecurringBlocks.ts` | CRUD operations for recurring blocks |
| `src/hooks/useRecurringBlockApproval.ts` | Approval workflow (approve/reject) |

### 3. Modified Files

| File | Change |
|------|--------|
| `src/pages/InstructorAvailability.tsx` | Add Tabs component with absences + recurring blocks |
| `src/lib/scheduler-utils.ts` | Add `SchedulerRecurringBlock` type |
| `src/hooks/useSchedulerData.ts` | Fetch and expand recurring blocks into daily absences |
| `src/components/scheduler/PendingAbsencesList.tsx` | Include pending recurring blocks |

## UI Design

### InstructorAvailability Page (Updated)

```
[Tabs: Abwesenheiten | Wiederkehrend]

=== Wiederkehrend Tab ===

SCHNELLAUSWAHL
[🍽️ Mittagspause] [🌅 Nur Vormittage] [🌇 Nur Nachmittage] [➕ Benutzerdefiniert]

MEINE WIEDERKEHRENDEN BLÖCKE
┌─────────────────────────────────────────────────┐
│ Mittagspause                      [🟡 Beantragt]│
│ 🕐 12:00 - 13:00                               │
│ 📅 Mo, Di, Mi, Do, Fr                          │
│    Bis Saisonende                    [✏️] [🗑️] │
└─────────────────────────────────────────────────┘
```

### RecurringBlockDialog

```
┌─────────────────────────────────────────────────┐
│ Wiederkehrenden Block erstellen                 │
├─────────────────────────────────────────────────┤
│ Bezeichnung: [Mittagspause____________]         │
│                                                 │
│ Zeitfenster: [12:00] - [13:00]                  │
│                                                 │
│ Wochentage:                                     │
│ [Mo✓] [Di✓] [Mi✓] [Do✓] [Fr✓] [Sa] [So]        │
│ [Alle] [Mo-Fr] [Wochenende]                     │
│                                                 │
│ Gültigkeitszeitraum:                            │
│ [2024-12-01] - [________] (leer = Saisonende)   │
│                                                 │
│ ⚠️ Konflikt mit 3 bestehenden Buchungen:        │
│    • 15.12.2024 12:00-13:00: Max Müller        │
│    • 18.12.2024 12:00-13:00: Lisa Schmidt      │
│    • ...                                        │
│                                                 │
│ [Abbrechen]                    [Antrag senden]  │
└─────────────────────────────────────────────────┘
```

## Scheduler Integration

### Data Flow

```text
1. useSchedulerData fetches recurring_blocks for date range
2. For each block, expand into daily absences based on weekdays
3. Merge with one-time absences
4. BlockingBar renders both types identically
```

### Example Expansion Logic

```typescript
// In useSchedulerData.ts
const expandRecurringBlocks = (blocks, startDate, endDate) => {
  const expanded: SchedulerAbsence[] = [];
  
  for (const block of blocks) {
    // For each day in the range
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
      const dayOfWeek = d.getDay();
      
      if (block.weekdays.includes(dayOfWeek) && 
          d >= block.valid_from &&
          (!block.valid_until || d <= block.valid_until)) {
        expanded.push({
          id: `recurring-${block.id}-${format(d, 'yyyy-MM-dd')}`,
          instructorId: block.instructor_id,
          startDate: format(d, 'yyyy-MM-dd'),
          endDate: format(d, 'yyyy-MM-dd'),
          type: 'other',
          status: block.status,
          reason: block.reason,
          isFullDay: false,
          timeStart: block.start_time,
          timeEnd: block.end_time,
        });
      }
    }
  }
  
  return expanded;
};
```

## Approval Workflow Integration

### Pending Items List Update

The existing `PendingAbsencesList` will be extended to show both:
- One-time absences (existing)
- Recurring blocks (new)

Both share the same approve/reject actions with similar UI.

## Presets

| Preset | Time | Weekdays | Description |
|--------|------|----------|-------------|
| `lunch` | 12:00-13:00 | Mo-Fr | Standard lunch break |
| `morning_only` | 13:00-16:00 | Mo-Fr | Block afternoons (available mornings only) |
| `afternoon_only` | 09:00-12:00 | Mo-Fr | Block mornings (available afternoons only) |
| `custom` | User-defined | User-defined | Full customization |

## Implementation Order

1. **Database**: Create table, function, and RLS policies
2. **Types**: Add `SchedulerRecurringBlock` to `scheduler-utils.ts`
3. **Hooks**: Create `useRecurringBlocks.ts` and `useRecurringBlockApproval.ts`
4. **Components**: Build `RecurringBlocksTab` and `RecurringBlockDialog`
5. **Integration**: Update `InstructorAvailability.tsx` with tabs
6. **Scheduler**: Expand recurring blocks in `useSchedulerData.ts`
7. **Approval**: Extend `PendingAbsencesList` for recurring blocks

## Constraints Enforced

- Instructors can only manage their own blocks (RLS)
- Conflicts must be resolved before saving (blocking validation)
- End time must be after start time (form validation)
- At least one weekday must be selected
- Valid from date is required
