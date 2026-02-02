

# Simplify Training Progression

## Current Problem

The `next_training_id` field requires manually setting the progression for **each training individually**:

| Training | Next Training (manual) |
|----------|------------------------|
| Snow Kids Village | Blue Prince (need to set) |
| Blue Prince | Blue King (need to set) |
| Blue King | Blue Star (need to set) |
| ... | ... |

This is:
- **Redundant** - the progression is the same for all trainings
- **Error-prone** - easy to forget or set wrong links
- **Currently unused** - only 1 out of 11 trainings has `next_training_id` set

## Solution: Use `sort_order` for Automatic Progression

The `sort_order` field already exists but all trainings have `sort_order: 0`. We can use it to define progression automatically.

```text
BEFORE (per-training manual linking):
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Blue Prince      │───>│ Blue King        │───>│ Blue Star        │
│ next: Blue King  │    │ next: Blue Star  │    │ next: Red Prince │
└──────────────────┘    └──────────────────┘    └──────────────────┘

AFTER (automatic from sort_order):
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Blue Prince      │    │ Blue King        │    │ Blue Star        │
│ sort_order: 1    │───>│ sort_order: 2    │───>│ sort_order: 3    │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

Next training = first training with `sort_order > current` in same discipline.

---

## Changes

### 1. Remove `next_training_id` from Training Form

- Delete the "Nächstes Training" dropdown from `TrainingFormModal.tsx`
- Remove from form schema and submission

### 2. Add Sort Order to Training Form

Replace the removed field with a simple number input:

```text
┌────────────────────────────────────────────┐
│ Reihenfolge in Progression                 │
│ [1] ← simple number input                  │
│ Niedrigere Zahlen = frühere Stufen         │
└────────────────────────────────────────────┘
```

### 3. Update LevelSelector Progression Logic

Change from:
```typescript
// Current: lookup next_training_id
if (currentTraining?.next_training_id) {
  suggestedLevel = levels.find(l => l.id === currentTraining.next_training_id);
}
```

To:
```typescript
// New: find next by sort_order
const currentIndex = levels.findIndex(l => l.id === currentTrainingId);
if (currentIndex >= 0 && currentIndex < levels.length - 1) {
  suggestedLevel = levels[currentIndex + 1]; // Next in ordered list
  fallbackLevel = levels[currentIndex]; // Current level
}
```

### 4. Set Initial Sort Orders in Database

One-time migration to set proper sort_order values:

| Training | sort_order |
|----------|------------|
| Snow Kids Village | 1 |
| Windel Wedel | 2 |
| Blue Prince | 3 |
| Blue King | 4 |
| Blue Star | 5 |
| Red Prince | 6 |
| Red King | 7 |
| Red Star | 8 |
| Black Prince | 9 |
| Black Academy | 10 |

### 5. Display Progression on Training Cards

Show the progression visually on training cards:

```text
┌─────────────────────────────────┐
│ Blue Prince          [3]       │
│ 5-7 J. • Mo-Fr                 │
│ → Blue King                    │  ← shows next training
│ [Bearbeiten] [Kapazität]       │
└─────────────────────────────────┘
```

---

## File Changes

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/components/trainings/TrainingFormModal.tsx` | Remove next_training_id field, add sort_order input |
| MODIFY | `src/components/booking/LevelSelector.tsx` | Use sort_order-based progression instead of next_training_id |
| MODIFY | `src/components/trainings/TrainingCard.tsx` | Display next training from sorted list |
| MODIFY | `src/hooks/useGroupCourses.ts` | Remove next_training join, ensure sort_order ordering |
| MODIFY | `src/types/group-courses.ts` | Remove next_training_id from FormData |
| MIGRATION | Database | Set initial sort_order values for existing trainings |

---

## User Experience Improvement

### Before (confusing per-training setup)
- Open training 1, set next training
- Open training 2, set next training  
- Open training 3, set next training
- ... repeat for all trainings
- Easy to create broken chains

### After (simple sort order)
- Each training has a number (1, 2, 3...)
- Progression is automatic: 1 → 2 → 3 → ...
- Visual feedback shows "→ Next Training Name"
- One number change reorders everything

---

## Technical Summary

### Remove
- `next_training_id` field from training form
- `next_training` join from queries

### Add
- `sort_order` number input in training form
- Automatic progression in LevelSelector using ordered list position
- Visual progression indicator on training cards

### Migrate
- Set proper `sort_order` values for existing trainings

