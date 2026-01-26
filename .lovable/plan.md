

# Fix Data Import Errors - Implementation Plan

## Problem Summary

The test data import failed partially due to:
1. **Duplicate key violations** for existing instructors/customers/tickets
2. **Foreign key failures** for ticket_items (referencing non-imported instructors/tickets)
3. **Only 2 out of 317 ticket_items** imported, both missing instructor assignments

The scheduler shows no bookings because it requires `instructor_id IS NOT NULL`.

---

## Solution: Enhanced Import with Conflict Handling

### Phase 1: Fix Import Logic (`useDataImport.ts`)

**Problem:** Current upsert uses `onConflict: "id"` but tables have other unique constraints (email, ticket_number).

**Fix:** Implement proper conflict handling for each table:

```text
Table-Specific Conflict Keys:
- products: id
- instructors: id, email (handle email conflicts)
- customers: id, email (handle email conflicts)
- customer_participants: id
- tickets: id, ticket_number (handle ticket_number conflicts)
- ticket_items: id
```

**Changes:**
1. Use `upsert` with correct conflict columns
2. Add `ignoreDuplicates: true` for graceful handling
3. Insert records individually when batch fails to identify problematic rows

---

### Phase 2: Pre-Import Cleanup Option

Add a "Clear existing data" checkbox to the import wizard:

```text
Before Import Options:
[ ] Clear existing data before import (destructive)
    Warning: This will delete all existing data in the affected tables.
    
[ ] Skip duplicate records (recommended)
    Existing records will be preserved, new records added.
    
[ ] Update existing records
    Existing records will be updated with CSV data.
```

---

### Phase 3: Enhanced Error Reporting

Improve the ImportReport component to show:
1. **Per-table breakdown** with specific error counts
2. **Error categories**: duplicate key, FK violation, validation
3. **Actionable suggestions** for each error type
4. **"Retry failed rows" button** for FK errors after fixing dependencies

---

## Technical Implementation

### File Changes

**1. `src/hooks/useDataImport.ts`**
- Add conflict handling per table
- Implement batch retry with single-row fallback
- Track which records exist vs which are new
- Add option to delete existing data first

**2. `src/components/settings/DataImportWizard.tsx`**
- Add import mode selector (skip/update/clear)
- Show pre-import validation warnings
- Add "Re-import failed items" button

**3. `src/components/settings/ImportReport.tsx`**
- Categorize errors by type
- Add retry functionality
- Show migration suggestions

---

## Database Cleanup Script (Optional)

For immediate fix, a cleanup approach:

```sql
-- Step 1: Delete existing ticket_items (to avoid FK issues)
DELETE FROM ticket_items;

-- Step 2: Delete existing tickets
DELETE FROM tickets;

-- Step 3: Re-import with clean slate
```

**Important:** This should only be offered as an explicit user action with confirmation.

---

## Import Strategy for Success

The recommended flow for test data:

1. **First Time Import:**
   - Select "Clear existing data" mode
   - Import in FK order
   - Verify all tables populated

2. **Incremental Import:**
   - Select "Skip duplicates" mode
   - Only new records added
   - Existing data preserved

3. **Update Import:**
   - Select "Update existing" mode
   - Matches on ID/email/ticket_number
   - Overwrites with CSV values

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useDataImport.ts` | Add conflict handling, import modes, retry logic |
| `src/components/settings/DataImportWizard.tsx` | Add import mode selector, retry button |
| `src/components/settings/ImportReport.tsx` | Categorize errors, add suggestions |
| `src/lib/data-import/table-parsers.ts` | Add FK validation pre-check |

---

## Quick Fix (Immediate)

For an immediate workaround while the enhanced import is being built:

1. Delete existing conflicting data from database
2. Re-run the import with clean tables
3. Verify scheduler shows bookings

This requires database cleanup first via the backend.

---

## Expected Outcome

After implementation:
- Import handles duplicates gracefully
- Clear error messages for each failure type
- Option to clear and reimport
- Retry functionality for cascading FK errors
- Scheduler displays all imported bookings (317 items)

