

# Date and Weekday Validation Feature

## Summary

Implement automatic validation to detect mismatches between mentioned weekdays and dates in customer messages (e.g., "Montag, 17.01.2026" when the 17th is actually a Saturday). When a conflict is detected, the system will display a warning in the UI and generate a polite follow-up question in the suggested reply—without making assumptions about what the customer meant.

---

## Solution Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         Message Processing Flow                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Customer Message ──► AI Extraction ──► Date Validation ──► UI Display  │
│     "Montag,           (extracts        (validates         (shows       │
│      17.01.2026"       weekday +         weekday vs        warning +    │
│                        date)             actual day)       fix options) │
│                                                                         │
│                              ▼                                          │
│                        Reply Generation                                 │
│                        (includes polite                                 │
│                        clarification)                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Backend: Update `process-ai-message` Edge Function

**File:** `supabase/functions/process-ai-message/index.ts`

#### 1.1 Update Extraction Schema

Add `mentioned_weekday` field to the dates schema to capture what weekday the customer mentioned:

```typescript
dates: {
  type: "array",
  items: {
    type: "object",
    properties: {
      date: { type: "string", description: "Datum im Format YYYY-MM-DD" },
      mentioned_weekday: { 
        type: "string", 
        description: "Der vom Kunden genannte Wochentag (z.B. 'Montag', 'Mo'), null wenn nicht genannt" 
      },
      start_time: { type: "string" },
      end_time: { type: "string" },
      time_preference: { type: "string" }
    },
    required: ["date"]
  }
}
```

#### 1.2 Update System Prompt

Add instructions for weekday extraction in `EXTRACTION_PROMPT`:

```typescript
**DATUM UND WOCHENTAG EXTRAKTION:**
1. Wenn der Kunde ein Datum mit Wochentag nennt, extrahiere BEIDES:
   - "Montag, 17. Januar" → date: "2026-01-17", mentioned_weekday: "Montag"
   - "am 17.01." → date: "2026-01-17", mentioned_weekday: null
2. WICHTIG: Extrahiere den Wochentag IMMER wenn genannt, 
   auch wenn er nicht zum Datum zu passen scheint.
3. Die Validierung erfolgt in einem separaten Schritt.
```

#### 1.3 Add Date Validation Function

New function to validate extracted dates after AI extraction:

```typescript
interface DateValidationResult {
  date: string;
  mentioned_weekday: string | null;
  actual_weekday: string;
  is_valid: boolean;
  conflict_type: "none" | "weekday_mismatch";
  suggestion: string | null;
  participant_name?: string;
}

function validateDateWeekday(
  dateStr: string,
  mentionedWeekday: string | null
): DateValidationResult {
  const date = new Date(dateStr);
  const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", 
                    "Donnerstag", "Freitag", "Samstag"];
  const weekdaysShort = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  
  const actualWeekday = weekdays[date.getDay()];
  
  // No weekday mentioned = no conflict possible
  if (!mentionedWeekday) {
    return { date: dateStr, mentioned_weekday: null, actual_weekday: actualWeekday,
             is_valid: true, conflict_type: "none", suggestion: null };
  }
  
  // Normalize and compare
  const normalizedMentioned = mentionedWeekday.toLowerCase().trim();
  const isMatch = weekdays.some((w, i) => 
    normalizedMentioned === w.toLowerCase() ||
    normalizedMentioned === weekdaysShort[i].toLowerCase() ||
    w.toLowerCase().startsWith(normalizedMentioned.slice(0, 2))
  ) && weekdays[date.getDay()].toLowerCase().startsWith(normalizedMentioned.slice(0, 2));
  
  if (isMatch) {
    return { date: dateStr, mentioned_weekday: mentionedWeekday, 
             actual_weekday: actualWeekday, is_valid: true, 
             conflict_type: "none", suggestion: null };
  }
  
  // Conflict detected - find next occurrence of mentioned weekday
  const mentionedDayIndex = weekdays.findIndex(w => 
    w.toLowerCase().startsWith(normalizedMentioned.slice(0, 2)));
  let nextOccurrence: string | null = null;
  
  if (mentionedDayIndex !== -1) {
    const tempDate = new Date(dateStr);
    const daysUntilNext = (mentionedDayIndex - tempDate.getDay() + 7) % 7 || 7;
    tempDate.setDate(tempDate.getDate() + daysUntilNext);
    nextOccurrence = tempDate.toISOString().split("T")[0];
  }
  
  return {
    date: dateStr,
    mentioned_weekday: mentionedWeekday,
    actual_weekday: actualWeekday,
    is_valid: false,
    conflict_type: "weekday_mismatch",
    suggestion: nextOccurrence 
      ? `Der ${mentionedWeekday} wäre der ${formatDateGerman(nextOccurrence)}`
      : null
  };
}
```

#### 1.4 Integrate Validation into Processing Pipeline

Add validation step after extraction in `validateAndCleanExtraction`:

```typescript
// After extracting dates, validate them
const dateConflicts = validateAllDates(data);

if (dateConflicts.length > 0) {
  const summary = data.booking_summary || {};
  summary.date_conflicts = dateConflicts;
  summary.has_date_conflicts = true;
  
  const warnings = summary.warnings || [];
  warnings.push(`Datum/Wochentag-Konflikt: ${dateConflicts.length} Datum(e) stimmen nicht mit dem genannten Wochentag überein`);
  summary.warnings = warnings;
  
  data.booking_summary = summary;
}
```

---

### 2. Backend: Update `generate-reply` Edge Function

**File:** `supabase/functions/generate-reply/index.ts`

Add date conflict context to reply generation in `buildReplySystemPrompt`:

```typescript
// Add to context if date conflicts exist
if (extractedData.booking_summary?.has_date_conflicts) {
  const conflicts = extractedData.booking_summary.date_conflicts;
  
  contextParts.push(`
**WICHTIG - DATUM/WOCHENTAG-KONFLIKT ERKANNT:**
${conflicts.map(c => `
- Genannt: "${c.mentioned_weekday}, ${c.date}"
- Tatsächlicher Wochentag: ${c.actual_weekday}
- ${c.suggestion || ""}
`).join("\n")}

Du MUSST in deiner Antwort:
1. Höflich auf den Konflikt hinweisen
2. BEIDE Möglichkeiten nennen (das Datum ODER den Wochentag)
3. Um Klärung bitten
4. KEINE Buchung bestätigen, bis geklärt

Beispiel-Formulierung:
"Kurze Rückfrage zu deinem Wunschtermin: Du hast ${conflicts[0]?.mentioned_weekday}, ${formatDateGerman(conflicts[0]?.date)} geschrieben – 
der ${formatDateGerman(conflicts[0]?.date)} ist allerdings ein ${conflicts[0]?.actual_weekday}. Meinst du:
• ${conflicts[0]?.actual_weekday}, den ${formatDateGerman(conflicts[0]?.date)}, oder
• ${conflicts[0]?.mentioned_weekday}, den ${conflicts[0]?.suggestion ? formatDateGerman(conflicts[0]?.suggestion.split(" ").pop()) : "[nächsten " + conflicts[0]?.mentioned_weekday + "]"}?
Danke für die kurze Rückmeldung!"
`);
}
```

---

### 3. Frontend: New `DateConflictWarning` Component

**File:** `src/components/inbox/DateConflictWarning.tsx`

```tsx
import { AlertTriangle, Calendar } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface DateConflict {
  date: string;
  mentioned_weekday: string;
  actual_weekday: string;
  suggestion?: string;
  participant_name?: string;
}

export function DateConflictWarning({ conflicts }: { conflicts: DateConflict[] }) {
  if (!conflicts?.length) return null;
  
  return (
    <Alert variant="destructive" className="border-amber-500 bg-amber-50">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Datum/Wochentag-Konflikt erkannt</AlertTitle>
      <AlertDescription>
        {conflicts.map((conflict, idx) => (
          <div key={idx} className="mt-2 p-2 bg-white/50 rounded">
            <p><strong>Genannt:</strong> {conflict.mentioned_weekday}, {formatDate(conflict.date)}</p>
            <p><strong>Tatsächlich:</strong> {conflict.actual_weekday}</p>
            {conflict.suggestion && (
              <p className="text-sm text-amber-700">💡 {conflict.suggestion}</p>
            )}
          </div>
        ))}
        <p className="mt-2 text-amber-700 font-medium">
          ⚠️ Bitte beim Kunden nachfragen, bevor die Buchung erstellt wird.
        </p>
      </AlertDescription>
    </Alert>
  );
}
```

---

### 4. Frontend: Update `ExtractionPanel.tsx`

**File:** `src/components/inbox/ExtractionPanel.tsx`

Add the warning component to the extraction panel:

```tsx
import { DateConflictWarning } from "./DateConflictWarning";

// In the render, after booking summary warnings:
{data.booking_summary?.has_date_conflicts && (
  <DateConflictWarning conflicts={data.booking_summary.date_conflicts} />
)}
```

---

### 5. Frontend: Update Completeness Logic

**File:** `src/components/inbox/BookingReadyBadge.tsx`

Update `isBookingReady` to account for date conflicts:

```typescript
export function isBookingReady(data: any): boolean {
  if (!data) return false;
  
  // Date conflicts prevent booking
  if (data.booking_summary?.has_date_conflicts) {
    return false;
  }
  
  // ... existing logic ...
}

export function getMissingRequiredFields(data: any): string[] {
  const missing = /* existing logic */;
  
  if (data.booking_summary?.has_date_conflicts) {
    missing.push("date_weekday_conflict");
  }
  
  return missing;
}
```

Update field labels:

```typescript
const fieldLabels: Record<string, string> = {
  // ... existing labels ...
  date_weekday_conflict: "Datum/Wochentag-Konflikt muss geklärt werden",
};
```

---

### 6. Frontend: Update `ConvertToBookingButton.tsx`

**File:** `src/components/inbox/ConvertToBookingButton.tsx`

Disable button when date conflicts exist:

```tsx
const hasDateConflicts = extractedData?.booking_summary?.has_date_conflicts;

return (
  <>
    <Button 
      onClick={handleConvert} 
      disabled={isLoading || !extractedData || hasDateConflicts}
      className={className}
    >
      {hasDateConflicts ? (
        <>
          <AlertTriangle className="h-4 w-4 mr-2" />
          Datum klären
        </>
      ) : (
        <>
          <ArrowRight className="h-4 w-4 mr-2" />
          Buchung erstellen
        </>
      )}
    </Button>
    {hasDateConflicts && (
      <p className="text-xs text-amber-600 mt-1">
        Bitte zuerst den Datum/Wochentag-Konflikt mit dem Kunden klären.
      </p>
    )}
  </>
);
```

---

### 7. Update TypeScript Types

**File:** `src/hooks/useAIExtraction.ts`

Add new types for date conflicts:

```typescript
export interface DateConflict {
  date: string;
  mentioned_weekday: string | null;
  actual_weekday: string;
  is_valid: boolean;
  conflict_type: "none" | "weekday_mismatch";
  suggestion: string | null;
  participant_name?: string;
}

// Update BookingSummary interface
export interface BookingSummary {
  // ... existing fields ...
  date_conflicts?: DateConflict[];
  has_date_conflicts?: boolean;
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-ai-message/index.ts` | Add weekday extraction, validation function, integrate into pipeline |
| `supabase/functions/generate-reply/index.ts` | Add date conflict context to reply generation |
| `src/components/inbox/DateConflictWarning.tsx` | **NEW** - Warning component |
| `src/components/inbox/ExtractionPanel.tsx` | Import and display DateConflictWarning |
| `src/components/inbox/BookingReadyBadge.tsx` | Update completeness logic for conflicts |
| `src/components/inbox/ConvertToBookingButton.tsx` | Disable button when conflicts exist |
| `src/hooks/useAIExtraction.ts` | Add DateConflict types |

---

## Test Scenarios

| Input | Expected Result |
|-------|-----------------|
| "Montag, 17.01.2026" (17th is Saturday) | ❌ Conflict warning, booking disabled |
| "Samstag, 17.01.2026" (correct) | ✅ No warning, booking enabled |
| "am 17.01.2026" (no weekday) | ✅ No warning, booking enabled |
| "nächsten Montag" (no date) | ✅ AI calculates next Monday, no conflict |
| "Am Wochenende, 16./17. Januar" | ⚠️ Partial check (16th is Friday = conflict) |

