
# Simplify Training Form & Card Display

## Changes Overview

Two UI simplifications to reduce clutter and confusion:

| Current | Proposed |
|---------|----------|
| Sort order input field visible | Remove from UI (keep internal logic) |
| "CHF 0.00/Tag via Produkt X" | Just show "Produkt X" with pricing type badge |

---

## 1. Remove "Reihenfolge" Field from Form

The sort order field doesn't provide value to users - it's an internal mechanism for determining progression. We'll keep the logic working but hide the field from the UI.

**File: `TrainingFormModal.tsx`**

- Delete the entire FormField block for `sort_order` (lines 637-665)
- Keep `sort_order` in the form schema and submission logic (it will use the existing value or default to 0)
- Progression continues to work automatically based on database values

---

## 2. Simplify Product Display on Training Cards

Instead of showing a potentially misleading "CHF 0.00/Tag" (which happens with tiered pricing), we show:
- Product name only
- A small badge indicating pricing type (Staffel, Stunde, or Fixpreis)

**Example:**

```text
BEFORE:
┌────────────────────────────────────┐
│ CHF 0/Tag via Gruppenkurs Standard │
│     ⚠️ Kein Produkt verknüpft      │
└────────────────────────────────────┘

AFTER:
┌────────────────────────────────────┐
│ 📦 Gruppenkurs Standard [Staffel]  │
│     ⚠️ Kein Produkt verknüpft      │
└────────────────────────────────────┘
```

---

## Technical Changes

### File: `src/types/group-courses.ts`
Add `pricing_type` to `LinkedProduct` interface

### File: `src/hooks/useGroupCourses.ts`  
Update product select query to include `pricing_type`

### File: `src/components/trainings/TrainingCard.tsx`
Replace price display with product name + pricing type badge

### File: `src/components/trainings/TrainingFormModal.tsx`
Remove sort_order FormField from JSX

---

## File Changes Summary

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/types/group-courses.ts` | Add `pricing_type` to LinkedProduct |
| MODIFY | `src/hooks/useGroupCourses.ts` | Include `pricing_type` in product query |
| MODIFY | `src/components/trainings/TrainingCard.tsx` | Show product name + pricing badge |
| MODIFY | `src/components/trainings/TrainingFormModal.tsx` | Remove sort_order field from UI |

---

## Result

- **Form:** Cleaner, fewer confusing fields
- **Cards:** Clear product association without misleading prices
- **Progression:** Still works automatically via database sort_order values
