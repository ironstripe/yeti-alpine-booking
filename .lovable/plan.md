

# Fix Customer Edit Save Error

## Problem

When editing a customer and changing **any field** (like country from Liechtenstein to Switzerland), the save fails with "Kunde konnte nicht aktualisiert werden" error.

**Root Cause**: The `holiday_address` column in the database has:
- `NOT NULL` constraint (is_nullable: NO)
- Default value: `''` (empty string)

But the code sends `null` when the field is empty:

```typescript
// Line 140 - sends null for empty fields
holiday_address: data.holiday_address || null,  // "" || null = null
```

Even though you only changed the country, the form sends ALL fields on submit, and the empty `holiday_address` gets converted to `null`, which violates the database constraint.

---

## Solution

Change `holiday_address: data.holiday_address || null` to `holiday_address: data.holiday_address || ""` to send an empty string instead of null.

**File: `src/components/bookings/wizard/CustomerEditDialog.tsx`**

### Line 140 (API call):
```typescript
// Before:
holiday_address: data.holiday_address || null,

// After:
holiday_address: data.holiday_address || "",
```

### Line 155 (local state update):
```typescript
// Before:
holiday_address: data.holiday_address || null,

// After:
holiday_address: data.holiday_address || "",
```

---

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `src/components/bookings/wizard/CustomerEditDialog.tsx` | 140, 155 | Replace `\|\| null` with `\|\| ""` for `holiday_address` |

---

## Expected Result

After this fix:
- Changing country (or any other field) will save successfully
- Empty holiday_address sends `""` (empty string) which is allowed by the database
- All customer edits will work properly

