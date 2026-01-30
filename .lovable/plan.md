
# Fix: Restore Tabs Functionality in AI Test Panel

## Problem

The recent layout change broke the AI Test Panel by wrapping `TabsContent` components inside a single `ScrollArea`. This breaks Radix UI's tab visibility mechanism - the inactive tab content uses `display: none`, causing the ScrollArea to incorrectly calculate its height and hide all content.

## Root Cause

| Before (broken) | Why it fails |
|-----------------|--------------|
| `ScrollArea` wrapping both `TabsContent` | ScrollArea can't measure hidden content |
| `TabsContent` visibility controlled by CSS | Content becomes invisible to ScrollArea |
| Result: Empty panel with only button visible | Both tabs appear empty |

## Solution

Move `ScrollArea` INSIDE each `TabsContent` instead of wrapping them. This ensures each tab's content scrolls independently while maintaining proper visibility.

```text
WRONG (current):                    CORRECT (fix):
ScrollArea                          TabsContent value="samples"
  TabsContent value="samples"         ScrollArea
    content...                           content...
  TabsContent value="custom"        TabsContent value="custom"
    content...                        ScrollArea
                                        content...
```

## Changes

### File: `src/components/inbox/AITestPanel.tsx`

Remove the outer `ScrollArea` wrapper and add individual `ScrollArea` inside each `TabsContent`:

```typescript
<Tabs value={tab} onValueChange={...} className="flex-1 flex flex-col min-h-0">
  <TabsList className="grid w-full grid-cols-2 shrink-0">
    <TabsTrigger value="samples">Beispiele</TabsTrigger>
    <TabsTrigger value="custom">Eigener Text</TabsTrigger>
  </TabsList>

  {/* Each TabsContent gets its own ScrollArea */}
  <TabsContent value="samples" className="flex-1 mt-3 data-[state=inactive]:hidden">
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-4">
        {/* Sample cards */}
      </div>
    </ScrollArea>
  </TabsContent>

  <TabsContent value="custom" className="flex-1 mt-3 data-[state=inactive]:hidden">
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-4">
        {/* Subject input */}
        {/* Textarea */}
      </div>
    </ScrollArea>
  </TabsContent>
</Tabs>

{/* Button stays outside tabs, always visible */}
<div className="flex gap-2 shrink-0">
  <Button ...>Extraktion starten</Button>
</div>
```

## Expected Result

| Before (broken) | After (fixed) |
|-----------------|---------------|
| Empty panel, no tabs visible | Tabs with content visible |
| Cannot enter custom text | Input fields work properly |
| Button at top, nothing else | Button at bottom, content above |

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/components/inbox/AITestPanel.tsx` |
