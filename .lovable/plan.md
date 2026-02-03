

# Simplify AI Test Panel - Remove Sample Messages

## Overview

Remove the sample message options from the "KI testen" dialog and keep only the custom text input ("Eigener Text").

## Changes

### File: `src/components/inbox/AITestPanel.tsx`

1. **Remove tab state and tabs UI** - No more switching between "Beispiele" and "Eigener Text"
2. **Remove sample selection state** - `selectedSample` no longer needed
3. **Remove SAMPLE_MESSAGES import** - No longer used
4. **Simplify layout** - Show only subject + content inputs directly
5. **Update reset handler** - Remove tab reset logic
6. **Update empty state text** - Reference only custom text input

**Before:**
- Tabs: "Beispiele" | "Eigener Text"
- Sample cards with pre-defined messages
- Custom input fields

**After:**
- Direct input fields (no tabs)
- Subject input (optional)
- Content textarea

## Code Changes

```typescript
// Remove these imports/state:
- import { SAMPLE_MESSAGES, type SampleKey } from "@/hooks/useTestConversation";
- const [tab, setTab] = useState<"samples" | "custom">("samples");
- const [selectedSample, setSelectedSample] = useState<SampleKey>("complete");

// Simplify handleRunTest - always use custom content
const handleRunTest = async () => {
  if (!customContent.trim()) return;
  // ... rest stays the same but without sample logic
};

// Simplify handleReset
const handleReset = () => {
  setExtractionResult(null);
  setCustomContent("");
  setCustomSubject("");
};

// Remove Tabs component entirely, show inputs directly
```

## Result

A cleaner, simpler dialog with just the custom text input that the user actually needs.

