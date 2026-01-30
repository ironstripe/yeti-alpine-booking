
# Fix: AI Test Panel Layout Issue

## Problem

The current implementation uses `ScrollArea className="h-full"` inside `TabsContent` with `flex-1`. This combination doesn't work because:

| Element | CSS | Issue |
|---------|-----|-------|
| TabsContent | `flex-1` | Grows to fill space, but has no explicit height |
| ScrollArea | `h-full` | Needs explicit parent height to calculate 100% |
| Result | | ScrollArea collapses to 0 height, content invisible |

## Solution

Remove `ScrollArea` from wrapping the entire tab content and only use it where needed for scrolling long lists. The input fields (Subject and Textarea) should just be in a simple div - they don't need scroll wrapping.

For the samples tab, keep ScrollArea but with an explicit height rather than `h-full`.

## Changes

### File: `src/components/inbox/AITestPanel.tsx`

**Key changes:**
1. Remove `flex-1` from `Tabs` and `TabsContent` - these don't need to grow
2. Give samples ScrollArea an explicit max height
3. Remove ScrollArea from custom tab - the textarea handles its own sizing
4. Keep button at bottom with a simple layout

```typescript
{/* Input Section */}
<div className="flex flex-col gap-4">
  <Tabs value={tab} onValueChange={(v) => setTab(v as "samples" | "custom")}>
    <TabsList className="grid w-full grid-cols-2">
      <TabsTrigger value="samples">Beispiele</TabsTrigger>
      <TabsTrigger value="custom">Eigener Text</TabsTrigger>
    </TabsList>

    <TabsContent value="samples" className="mt-3">
      <ScrollArea className="h-[300px]">
        <div className="space-y-3 pr-4">
          {/* Sample cards */}
        </div>
      </ScrollArea>
    </TabsContent>

    <TabsContent value="custom" className="mt-3">
      <div className="space-y-3">
        {/* Subject input */}
        {/* Textarea - no ScrollArea wrapper needed */}
      </div>
    </TabsContent>
  </Tabs>

  {/* Button at bottom */}
  <div className="flex gap-2">
    <Button onClick={handleRunTest} ...>
      Extraktion starten
    </Button>
  </div>
</div>
```

## Why This Works

| Before (broken) | After (fixed) |
|-----------------|---------------|
| `flex-1` + `h-full` = no computed height | Explicit `h-[300px]` on samples ScrollArea |
| ScrollArea wrapping textarea breaks input | Textarea in simple div, handles own scroll |
| Complex flex layout | Simple stack layout |

## Files to Modify

| Action | File |
|--------|------|
| **MODIFY** | `src/components/inbox/AITestPanel.tsx` |
