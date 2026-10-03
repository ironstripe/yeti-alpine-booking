# UI-01 foundations and bookings/payment pilot

## Scope
Implement the authorized, presentation-only UI-01 package on the verified current head `740b8f27386586799d79c17263a06ef2557435fe`. Preserve all booking and payment behavior, data semantics, handlers, state, validation, mutations, and unfinished actions.

## Changes
1. **Document the UI standard**
   - Add `docs/ui-standard.md` with reusable presentational rules for hierarchy, spacing, semantic color use, one leading workspace action, accessible icon actions, table links, field grouping, dialog/sheet structure, and responsive behavior.
   - Clearly separate what UI-01 implements from future approval/details, wizard, scheduler, and remaining-module proposals.

2. **Improve primary-action contrast without changing information colors blindly**
   - Introduce explicit semantic action/link tokens where needed, keeping the YETI blue hue.
   - Ensure regular primary button foreground/background and hover combinations meet at least 4.5:1 in light and dark themes.
   - Review affected shared-token usages so links and navigation remain recognizable and usable.

3. **Add a presentational icon-action convention**
   - Reuse the shared Button component with a small convention that provides at least 36×36 CSS pixels for pointer use and 44×44 on touch-capable devices.
   - Apply it only to the booking actions trigger, column chooser, and payment-sheet close control.
   - Add or preserve accessible German names; do not touch dense scheduler geometry.

4. **Refine the bookings list presentation**
   - Keep `BookingSourceBadge` source fallback, labels, and icons exactly as-is while using one neutral muted treatment for every source.
   - Turn the ticket identifier into an accessible link to the existing detail path and stop its click from also firing row navigation.
   - Preserve row navigation, checkboxes, action menu, status precedence, selection, search, and filtering.
   - Make the filter toolbar wrap and fit smaller widths without changing its logic.

5. **Convert payment presentation from dialog to right-hand sheet**
   - Keep `PaymentModal` state initialization, calculations, fields, handlers, mutation payload, disabled rules, pending state, reset, close, and submit behavior unchanged.
   - Present it as a right sheet: full-width on small screens, 520px on sufficiently wide screens, with fixed header/footer and one scrollable body.
   - Keep the form submit association, Radix focus trap/return focus, nested Select behavior, and existing ticket identifier.
   - Add a local lighter overlay option to the shared Sheet with the current overlay as the default for every other sheet.

6. **Verify only this package**
   - Review the diff specifically for unchanged business behavior.
   - Run available TypeScript and build checks.
   - Use the authenticated local preview at 1440×900, 1280px, 1024px, and 390×844; dismiss only the local onboarding overlay, then inspect the bookings table and open the payment sheet without submitting.
   - Check long text/ticket fit, Tab/Shift-Tab/Escape, nested payment-method Select, close behavior, focus return, clipping, scroll, and console accessibility warnings.
   - Capture after screenshots. The before capture is partially obstructed by the existing onboarding tour, which will be reported rather than bypassed through runtime/auth changes.

## Explicitly unchanged
- No hook, state/effect, calculation, validation, mutation, request, schema, function, permission, business rule, persistence, configuration, deployment, publication, production write, or message-send changes.
- No changes to the existing table skeleton.
- Confirmation resend, duplicate, and cancellation TODO handlers remain untouched and are reported as existing out-of-scope work.
