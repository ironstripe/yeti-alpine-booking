
## What’s happening (rephrased)
You can open the “Neuer Skilehrer” modal, but as soon as you interact with the **roles** (notably clicking “Büro”), the app crashes with **“Maximum update depth exceeded”**.

We already fixed one potential loop (`Dialog onOpenChange`), but the crash persists, so the loop is happening elsewhere.

## What I observed / isolated
- The crash is reproducible when interacting with **RoleSelector** inside `NewInstructorModal`.
- The error stack points into Radix internals (`@radix-ui/react-compose-refs` → `setRef`), which is a common symptom when rapid/repeated synchronous re-renders happen during Radix event handling (Radix uses `flushSync` for certain discrete events).
- `RoleSelector.tsx` currently triggers role changes from **two handlers for a single click**:
  - The **wrapper row** has `onClick={() => toggleRole(role.id)}`
  - The **Checkbox** also has `onCheckedChange={() => toggleRole(role.id)}`
  This can lead to immediate double updates (toggle on + toggle off) in a single interaction and can cascade into Radix/Presence ref re-composition loops (the “setRef” part of the stack).

## Do I know what the issue is?
Yes: **RoleSelector fires role state updates twice per user click**, which can trigger a nested update loop inside Radix’s discrete-event/ref composition logic (seen as `setRef` in the stack).

## Fix approach (code changes)
### 1) Make RoleSelector update roles from exactly one source of truth
In `src/components/instructors/RoleSelector.tsx`:
- Remove the clickable wrapper behavior OR ensure it does not also trigger the checkbox handler.
- Recommended: keep the UI clickable, but make the Checkbox be the only controller and use the `checked` argument properly.

Concretely:
- Remove `onClick={() => toggleRole(role.id)}` from the wrapper row
  - Option A (simplest): wrapper becomes non-clickable; user clicks checkbox.
  - Option B (better UX): replace wrapper `div` with a `<label>` pattern or a `<button type="button">` that toggles, while the checkbox uses `onClick={(e) => e.stopPropagation()}` to prevent double triggers.
- Change `onCheckedChange={() => toggleRole(role.id)}` to use the passed value:
  - If `checked === true`, add role if not present
  - If `checked === false`, remove role (but prevent removing the last role)

This ensures a click produces exactly one state transition and matches Radix’s controlled component expectations.

### 2) Verify EditInstructorModal is also safe
`RoleSelector` is also used in `src/components/instructors/EditInstructorModal.tsx`.
- Once RoleSelector is fixed centrally, both New and Edit modals should stop crashing.
- We’ll still open the Edit modal and toggle roles to confirm.

### 3) (Optional hardening) Prevent office-only from leaving stale instructor-only fields
Not required for the crash, but good hygiene:
- When roles become “office only” (no teaching role), we can clear `level` via `setValue("level", "")` or a placeholder value in a `useEffect`.
- This should be done carefully to avoid reintroducing loops (effect must only run on meaningful transitions).

## Testing checklist (end-to-end)
1. Go to **/instructors**
2. Click **Neuer Skilehrer**
3. Toggle roles repeatedly:
   - Add/remove “Büro”
   - Add/remove “Snowboardlehrer”
   - Ensure you cannot remove the last remaining role
4. Confirm **no crash** and UI remains responsive
5. Confirm “Ausbildungsstufe” only shows when a teaching role is selected
6. Repeat role toggling inside **Edit Instructor** modal (if available)

## Files involved
- `src/components/instructors/RoleSelector.tsx` (primary fix)
- `src/components/instructors/EditInstructorModal.tsx` (verification, possibly minor adjustment if needed)
- `src/components/instructors/NewInstructorModal.tsx` (no further changes expected for this crash)

## If the crash still happens after this fix
We’ll do a focused minimal reproduction:
- Temporarily replace the Radix `Checkbox` with a native `<input type="checkbox">` in RoleSelector to confirm whether the loop is purely Radix-event/ref related or something else in the form integration.
- Add targeted `console.log` markers around role updates to detect unintended repeated updates.
