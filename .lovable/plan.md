

# YETI Test Data Import - Implementation Plan

## Overview
Implement a comprehensive test data import feature for the YETI ski school booking system. This will import 6 CSV files containing 1,234 records (customers, participants, instructors, products, tickets, ticket_items) from a ZIP archive.

## Data Analysis Summary

Based on my exploration of the codebase and the provided import documentation:

| Table | Records | Key Fields |
|-------|---------|------------|
| products | 6 | name, type, price, pricing_type |
| instructors | 26 | first_name, last_name, email, phone, hourly_rate |
| customers | 557 | email, last_name, first_name, phone, holiday_address |
| customer_participants | 245 | customer_id, first_name, birth_date, sport, level |
| tickets | 315 | ticket_number, customer_id, status, total_amount |
| ticket_items | 317 | ticket_id, product_id, participant_id, instructor_id, date |

### Schema Mapping Analysis
I compared the CSV columns with the database schema and identified the following:

**Confirmed Matches:**
- `customers`: All columns match (id, email, last_name, first_name, phone, etc.)
- `customer_participants`: All columns match (id, customer_id, first_name, birth_date, sport, level_current_season)
- `instructors`: All columns match (id, first_name, last_name, email, phone, hourly_rate, status, specialization, level, languages)
- `products`: All columns match (id, name, type, price, duration_minutes, is_active, pricing_type, sort_order)
- `tickets`: All columns match (id, ticket_number, customer_id, status, total_amount, paid_amount, payment_method, notes, ticket_type)
- `ticket_items`: All columns match (id, ticket_id, product_id, participant_id, instructor_id, date, time_start, time_end, unit_price, status, meeting_point, skill_level, instructor_confirmation, group_name)

**Note:** The CSV uses comma (,) delimiter while the existing CSV parser uses semicolon (;). This needs to be configurable.

---

## Implementation Plan

### Phase 1: Settings Page & Navigation

#### 1.1 Add Settings Navigation Item
**File:** `src/components/settings/SettingsLayout.tsx`

Add new navigation item for "Datenimport":
```typescript
{ title: "Datenimport", url: "/settings/import", icon: Upload }
```

#### 1.2 Create Import Settings Page
**File:** `src/pages/SettingsDataImport.tsx`

Multi-step import wizard:
1. **Upload Step:** ZIP file upload with drag & drop
2. **Parse Step:** Extract and validate CSV files
3. **Preview Step:** Show parsed data summary with column mapping
4. **Import Step:** Sequential import with progress tracking
5. **Result Step:** Show import report with success/error counts

---

### Phase 2: Core Import Logic

#### 2.1 Generic CSV Parser Enhancement
**File:** `src/lib/data-import/csv-parser.ts`

Extend existing `parseCSVContent` to support:
- Configurable delimiter (comma or semicolon)
- Generic column mapping with fuzzy matching
- Type validation (UUID, DATE, TIME, NUMBER, BOOLEAN)
- Error collection per row

```typescript
interface CSVParseOptions {
  delimiter: "," | ";";
  columnMapping: Record<string, string>;
  typeValidation: Record<string, "uuid" | "date" | "time" | "number" | "boolean" | "string">;
}

interface ParsedRow<T> {
  rowNumber: number;
  data: Partial<T>;
  warnings: string[];
  errors: string[];
  isValid: boolean;
}
```

#### 2.2 Table-Specific Parsers
**File:** `src/lib/data-import/table-parsers.ts`

Create parsers for each table:
- `parseCustomersCSV(content: string): ParseResult<Customer>`
- `parseParticipantsCSV(content: string): ParseResult<CustomerParticipant>`
- `parseInstructorsCSV(content: string): ParseResult<Instructor>`
- `parseProductsCSV(content: string): ParseResult<Product>`
- `parseTicketsCSV(content: string): ParseResult<Ticket>`
- `parseTicketItemsCSV(content: string): ParseResult<TicketItem>`

Each parser will:
1. Map CSV columns to database fields
2. Validate data types
3. Apply default values for optional fields
4. Collect warnings/errors per row

#### 2.3 ZIP File Handler
**File:** `src/lib/data-import/zip-handler.ts`

```typescript
interface ZipContents {
  files: Map<string, string>; // filename -> content
  statistics?: object;
  readme?: string;
}

async function extractZipFile(file: File): Promise<ZipContents>
```

Uses JSZip library (needs to be added as dependency).

---

### Phase 3: Import Service

#### 3.1 Import Orchestrator Hook
**File:** `src/hooks/useDataImport.ts`

```typescript
interface ImportProgress {
  currentTable: string;
  totalTables: number;
  completedTables: number;
  currentRow: number;
  totalRows: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

interface ImportResult {
  success: boolean;
  tables: {
    name: string;
    inserted: number;
    skipped: number;
    errors: number;
  }[];
  totalRecords: number;
  totalErrors: number;
}

function useDataImport() {
  // Returns mutation for importing data with progress tracking
}
```

#### 3.2 Import Order Logic
Import in FK-respecting order:
1. **products** - No FK dependencies
2. **instructors** - No FK dependencies
3. **customers** - No FK dependencies
4. **customer_participants** - Depends on customers
5. **tickets** - Depends on customers
6. **ticket_items** - Depends on tickets, products, instructors, participants

#### 3.3 Transaction Handling
- Import each table in a transaction
- Rollback on critical errors
- Continue with warnings
- Log all issues for final report

---

### Phase 4: UI Components

#### 4.1 Import Wizard Component
**File:** `src/components/settings/DataImportWizard.tsx`

Multi-step wizard with:
1. **Step 1 - Upload:** Drag & drop zone for ZIP file
2. **Step 2 - Validate:** Show parsed data summary, column mapping
3. **Step 3 - Import:** Progress bar, current table indicator
4. **Step 4 - Report:** Success/error summary, detailed log

#### 4.2 Table Preview Component
**File:** `src/components/settings/ImportTablePreview.tsx`

Shows:
- Table name and record count
- Sample rows (first 5)
- Column mapping
- Validation status (valid/warnings/errors)

#### 4.3 Import Report Component
**File:** `src/components/settings/ImportReport.tsx`

Shows:
- Overall status (Success/Partial/Failed)
- Per-table statistics
- Error details with row numbers
- Warning list
- Next steps guidance

---

### Phase 5: Routing & Integration

#### 5.1 Add Route
**File:** `src/App.tsx`

```typescript
<Route path="/settings/import" element={<SettingsDataImport />} />
```

---

## Technical Considerations

### Dependencies
Add `jszip` library for ZIP file extraction:
```json
"jszip": "^3.10.1"
```

### Business Rules Enforcement
1. **Instructor Confirmation:** Preserve `pending`/`confirmed` status from CSV (50/50 split)
2. **Prices = 0:** Accept as valid (MVP calculates prices)
3. **Duplicates:** Do NOT deduplicate - intentional for testing
4. **Skill Levels:** Map to existing values (anfaenger, blue_prince, blue_king, etc.)

### Error Handling Strategy
1. **Automatic Fixes:**
   - Empty strings → NULL
   - Invalid dates → Skip row with warning
   - Missing optional fields → Use defaults

2. **Ask User:**
   - Column name mismatch < 80% confidence
   - Required field missing with no default
   - FK reference not found (after base tables imported)

3. **Fatal Errors:**
   - ZIP extraction failure
   - No valid rows in a required table
   - All rows fail validation

### Validation Checks
- UUID format validation
- Date format: YYYY-MM-DD
- Time format: HH:MM:SS
- Email format for customers/instructors
- FK references exist (after parent table imported)

---

## File Structure

```
src/
├── lib/
│   └── data-import/
│       ├── index.ts              # Exports
│       ├── csv-parser.ts         # Generic CSV parser
│       ├── table-parsers.ts      # Table-specific parsers
│       ├── zip-handler.ts        # ZIP extraction
│       └── validation.ts         # Type validators
├── hooks/
│   └── useDataImport.ts          # Import orchestrator
├── components/
│   └── settings/
│       ├── DataImportWizard.tsx  # Main wizard
│       ├── ImportTablePreview.tsx
│       └── ImportReport.tsx
└── pages/
    └── SettingsDataImport.tsx    # Settings page
```

---

## Expected Outcome

After implementation, users will be able to:
1. Navigate to Settings → Datenimport
2. Upload the `yeti_testdata.zip` file
3. Preview the data and verify column mappings
4. Execute the import with live progress tracking
5. View a detailed import report
6. See all test data in the application UI

**Success Criteria:**
- 6 tables imported
- 1,234 total records
- All FK constraints satisfied
- Instructor confirmation status preserved (50/50)
- Import report generated

