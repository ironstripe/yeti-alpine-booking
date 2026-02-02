

# Simplify Training Navigation

## Problem

The sidebar currently has 3 separate items for training-related features:

| Current Item | Route | Purpose |
|--------------|-------|---------|
| Trainings | `/trainings` | Course template management (Blue Prince, etc.) |
| Wochenplanung | `/trainings/planning` | Weekly instructor assignments |
| Kapazität | `/trainings/capacity` | Split/merge overbooked groups |

This is inconsistent with how **Einstellungen** works (single sidebar item with internal navigation for all sub-pages). All three pages deal with the same domain: managing group courses.

---

## Solution

### Consolidate into Single Sidebar Item with Tabs

Create a unified training management experience using the same pattern as Settings:

```text
Sidebar:                    Internal Navigation:
+------------------+        +------------------------------------------+
| ...              |        | Trainings                                |
| Trainings  ●─────|───────>| [Kurse] [Wochenplanung] [Kapazität]     |
| Events           |        |                                          |
| ...              |        | (content based on selected tab)          |
+------------------+        +------------------------------------------+
```

### Changes

**1. Remove from Sidebar:**
- "Wochenplanung" item
- "Kapazität" item

**2. Create TrainingsLayout Component:**
Similar to `SettingsLayout.tsx`, with horizontal tabs:

| Tab | Route | Current Page |
|-----|-------|--------------|
| Kurse | `/trainings` | Trainings.tsx |
| Wochenplanung | `/trainings/planning` | GroupCoursePlanning.tsx |
| Kapazität | `/trainings/capacity` | GroupCapacityPlanning.tsx |

**3. Update Each Training Page:**
Wrap content in the new `TrainingsLayout` component.

---

## Implementation Details

### New Component: `TrainingsLayout.tsx`

```text
src/components/trainings/TrainingsLayout.tsx

- PageHeader with "Trainings" title
- Horizontal tab navigation (Tabs component)
- Routes to /trainings, /trainings/planning, /trainings/capacity
- Children slot for page content
```

### Files to Modify

| File | Change |
|------|--------|
| `src/components/layout/AppSidebar.tsx` | Remove Wochenplanung and Kapazität nav items |
| `src/components/trainings/TrainingsLayout.tsx` | NEW - wrapper with tab navigation |
| `src/pages/Trainings.tsx` | Wrap in TrainingsLayout |
| `src/pages/GroupCoursePlanning.tsx` | Wrap in TrainingsLayout |
| `src/pages/GroupCapacityPlanning.tsx` | Wrap in TrainingsLayout |

### Sidebar Before/After

```text
BEFORE:                          AFTER:
- Dashboard                      - Dashboard
- Posteingang                    - Posteingang
- Buchungen                      - Buchungen
- Stundenplan                    - Stundenplan
- Kunden                         - Kunden
- Skilehrer                      - Skilehrer
- Listen                         - Listen
- Shop                           - Shop
- Gutscheine                     - Gutscheine
- Berichte                       - Berichte
- Tagesabschluss                 - Tagesabschluss
- Trainings           ───────>   - Trainings (with tabs inside)
- Events                         - Events
- Wochenplanung       (removed)
- Kapazität           (removed)
- Einstellungen                  - Einstellungen
```

---

## UI Design

The `TrainingsLayout` will use horizontal tabs (not a vertical sidebar like Settings) since there are only 3 sub-pages:

```text
+----------------------------------------------------------+
| Trainings                                    [+ Neues...] |
| Verwalte Gruppenkurse, Lehrerzuweisungen und Kapazität   |
+----------------------------------------------------------+
| [Kurse]  [Wochenplanung]  [Kapazität]                    |
+----------------------------------------------------------+
|                                                          |
|  (Tab content renders here)                              |
|                                                          |
+----------------------------------------------------------+
```

### Tab Behavior
- Active tab highlighted
- URL-based routing (tabs change route)
- Each tab shows its own action button in the header

---

## Technical Summary

### Create
- `src/components/trainings/TrainingsLayout.tsx`

### Modify
- `src/components/layout/AppSidebar.tsx` - remove 2 items
- `src/pages/Trainings.tsx` - add TrainingsLayout wrapper
- `src/pages/GroupCoursePlanning.tsx` - add TrainingsLayout wrapper  
- `src/pages/GroupCapacityPlanning.tsx` - add TrainingsLayout wrapper

---

## Benefits

1. **Cleaner sidebar** - 2 fewer items, less visual clutter
2. **Consistent pattern** - matches how Settings works
3. **Logical grouping** - all training features in one place
4. **Easier navigation** - users find related features together
5. **Routes unchanged** - no breaking changes to bookmarks/links

