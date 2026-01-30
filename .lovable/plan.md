
# Fix: Make AI Test Panel Button Always Visible

## Summary

The "Extraktion starten" button exists but is hidden below the visible area when the custom text tab is active. The textarea's min-height pushes the button outside the dialog's visible bounds.

---

## Root Cause

| Element | Issue |
|---------|-------|
| Dialog | Has `max-h-[90vh]` and `overflow-hidden` |
| Input section | No scroll capability (`flex flex-col gap-4`) |
| Textarea | Has `min-h-[200px]` which takes significant space |
| Button | Positioned after Tabs, gets pushed below visible area |

---

## Solution

Restructure the input section to keep the button always visible at the bottom, with a scrollable content area above it.

### Layout Change

```text
Before:                          After:
+------------------+             +------------------+
| Tabs Header      |             | Tabs Header      |
+------------------+             +------------------+
| Tab Content      |             | Tab Content      |
| (grows freely)   |             | (scrollable)     |
+------------------+             +------------------+
| Button           |  <- hidden  | Button           |  <- always visible
+------------------+             +------------------+
```

---

## Changes

### File: `src/components/inbox/AITestPanel.tsx`

1. **Wrap Tabs content in ScrollArea** - Make the tab content scrollable
2. **Keep button outside scroll area** - Fixed at bottom of input section
3. **Add proper height constraints** - Ensure content area scrolls

```typescript
{/* Input Section */}
<div className="flex flex-col gap-4 min-h-0">
  <Tabs value={tab} onValueChange={...} className="flex-1 flex flex-col min-h-0">
    <TabsList className="grid w-full grid-cols-2 shrink-0">
      ...
    </TabsList>

    <ScrollArea className="flex-1 mt-3">
      <TabsContent value="samples" className="space-y-3 mt-0">
        ...
      </TabsContent>

      <TabsContent value="custom" className="space-y-3 mt-0">
        ...
      </TabsContent>
    </ScrollArea>
  </Tabs>

  {/* Button always visible at bottom */}
  <div className="flex gap-2 shrink-0">
    <Button onClick={handleRunTest} ...>
      Extraktion starten
    </Button>
    ...
  </div>
</div>
```

---

## Expected Result

| Before | After |
|--------|-------|
| Button hidden when typing custom text | Button always visible at bottom |
| No way to trigger extraction | Clear "Extraktion starten" button visible |
| Must scroll (but can't) to find button | Fixed layout with scrollable content above |

---

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/components/inbox/AITestPanel.tsx` |
