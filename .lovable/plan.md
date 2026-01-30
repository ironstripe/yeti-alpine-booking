
Context recap (what’s happening)
- The “KI testen” dialog has gone through multiple layout refactors (nested ScrollAreas + flex height constraints). Those changes are easy to break because:
  - Radix Tabs uses “hidden/display:none” for inactive panels, which can confuse height/overflow measurements when wrapped incorrectly.
  - “h-full” requires a parent with an explicit height; combining it with flex growth without a concrete height can collapse content.
  - “overflow-hidden” on the dialog container can hide controls if the content grows.
- Separately, the “Restore/History doesn’t bring back old behavior” and “can’t get back to sidebar after going to History” are almost certainly editor/runtime issues, not just the AITestPanel code:
  - Restore is message-based and irreversible; it moves the project to a snapshot, and anything after is archived (not “merged back”).
  - Your app is a PWA-capable build; a service worker can serve cached JS/HTML even after a restore/publish, making it look like “restore didn’t work” until the cache updates or the page is hard-refreshed.
  - The History navigation issue sounds like a Lovable editor UI state problem (outside the app code). We can mitigate the cache/staleness part in the app, but not the editor’s sidebar behavior.

What I verified from code (current state)
- `src/components/inbox/AITestPanel.tsx` currently uses `DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"`.
- Input column is not scrollable, and button is inside that column.
- Samples tab uses `ScrollArea h-[300px]`. Results uses `ScrollArea h-[500px]`.
- This configuration can work on your screen, but it is fragile across viewport sizes and has already regressed multiple times.

Goal (restore a consistent, durable “working KI testing flow”)
- The dialog should always:
  1) allow typing in “Eigener Text”
  2) keep action buttons accessible (never pushed out of view)
  3) keep results visible and scrollable
  4) avoid height math that depends on hidden tab content
  5) match your app’s “global UI consistency standards” (BaseDialog + consistent footer)

Proposed implementation approach
A) Rebuild the KI Test dialog on top of the existing standardized dialog primitives
- Replace the custom `Dialog + DialogContent` layout in `AITestPanel.tsx` with the existing `BaseDialog` component (`src/components/ui/base-dialog.tsx`).
  - BaseDialog already enforces: header + scrollable content + footer pinned at the bottom.
  - This alone eliminates the entire class of “button pushed below the viewport” bugs without needing nested ScrollArea hacks.

B) Put actions into a real footer, not inside the scrolling content
- Move:
  - “Extraktion starten”
  - “Zurücksetzen”
  - (optional) “Schließen”
  into the dialog footer (use `DialogFooterActions` where it fits, or a custom footer layout).
- Keep the content area purely informational/input/results; let BaseDialog manage scrolling.

C) Remove fragile nested scrolling and fixed heights unless strictly necessary
- Input side:
  - Remove the `ScrollArea` around the samples list (you only have 3 samples; no scroll needed). This reduces complexity and avoids measuring issues.
  - Keep custom input as plain `<Input>` + `<Textarea>` (no ScrollArea wrapper).
- Results side:
  - Prefer a simple `div` with `overflow-auto` and a reasonable `max-h` that adapts, or rely on BaseDialog’s content scroll to handle long results.
  - If you still want independent scrolling on results (recommended), implement results with `className="max-h-[60vh] overflow-auto"` rather than `h-[500px]`, and avoid `overflow-hidden` on the dialog root.

D) Ensure state/flow behavior is “predictably working”
- On open:
  - Keep previous tab selection (or reset to Samples) depending on your preference; pick one and make it consistent.
- On “Zurücksetzen”:
  - Clear `extractionResult`, `customContent`, `customSubject` and optionally reset tab to “samples”.
- Disable logic:
  - Keep `disabled={isLoading || (tab==="custom" && !customContent.trim())}`.
  - Additionally show a small inline hint when disabled (e.g., “Bitte Text eingeben”), so it’s obvious why nothing runs.
- Add robust error feedback:
  - Currently errors only `console.error`. Add visible feedback (toast or inline error) when conversation creation or extraction fails.

E) Mitigate “restore didn’t work” symptoms caused by cached app assets (PWA)
This is the part that can make you feel like History/Restore is “lying”.
- Add a lightweight “New version available” update prompt for the PWA service worker:
  - Use `virtual:pwa-register` / `virtual:pwa-register/react` (provided by vite-plugin-pwa) to detect updates.
  - When an update is available, show a non-intrusive toast/banner: “Neue Version verfügbar – Aktualisieren”.
  - On click, call `updateServiceWorker(true)` and reload.
- Adjust caching strategy to reduce stale experiences:
  - Consider removing `html` from precache `globPatterns` in `vite.config.ts` to reduce stale app-shell issues after publish/restore.
  - Or switch to `registerType: "autoUpdate"` so updates are applied more aggressively.
  - We’ll pick the lowest-risk change first (update prompt) and only adjust caching patterns if you still see staleness.

F) Explain/handle the editor History/sidebar navigation issue
- This is likely not fixable via project code.
- We’ll document a reliable recovery workflow:
  - Hard refresh the editor page after a restore
  - If installed as an app (PWA), close and reopen it (installed PWAs can be “stickier” with caches)
  - If History view traps you, open the preview URL directly in a new tab to confirm whether the app changed
  - Use one single restore target (don’t “restore, then restore again” rapidly), to avoid confusion about which snapshot you’re currently on

Files to change (implementation)
1) `src/components/inbox/AITestPanel.tsx`
- Migrate from raw `DialogContent` to `BaseDialog`
- Move actions into BaseDialog’s footer
- Simplify tab contents (remove unnecessary ScrollAreas)
- Make results area scrollable in a resilient way (max-height + overflow-auto)
- Add visible error handling (toast or inline)

2) `src/App.tsx` (or a small UI-level component loaded globally)
- Register the PWA service worker update handler
- Show a toast/banner when a new version is available and allow user-triggered refresh

3) `vite.config.ts` (optional, only if needed after the update prompt)
- Adjust `registerType` or precache patterns to reduce stale loads

Step-by-step execution plan
1) Stabilize KI testen dialog layout
- Refactor AITestPanel to use BaseDialog
- Put “Extraktion starten / Zurücksetzen” in footer
- Remove nested ScrollAreas in tabs; keep only where truly needed

2) Restore “working flow” behaviors
- Confirm typing works, button enables correctly, loading states show, results render
- Add user-visible errors for failures

3) Reduce “restore looks broken” via update prompt
- Add PWA update detection + user-driven refresh
- Validate that after a publish/restore, the UI offers a refresh when needed

4) Verification checklist (end-to-end)
- Inbox → “KI testen” opens
- Switch to “Eigener Text” → type freely in textarea
- Button becomes enabled once text is entered
- Click “Extraktion starten”:
  - Loader appears
  - Result appears (booking or not booking)
  - Confidence indicator renders when available
- Try a very long custom text:
  - Footer buttons remain visible
  - Content scrolls naturally
- Close dialog and reopen:
  - State behavior matches the chosen rule (reset vs persist)

Notes / risk management
- The AITestPanel issue is fixable in code, but the “History/sidebar navigation” is likely outside the app. The PWA update prompt and clearer refresh guidance should address the “restore didn’t actually revert” perception when it’s really cached assets.

If you approve this approach, I’ll implement it in the next step (including the BaseDialog refactor and the PWA update prompt), then test the KI testen flow end-to-end in the preview.