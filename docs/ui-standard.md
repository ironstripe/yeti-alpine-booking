# YETI UI standard

This standard covers reusable presentation rules for the YETI office application. It does not change workflows, permissions, validation, calculations, persistence, or business meaning.

## Hierarchy and spacing

- Each workspace has one clear page heading and concise supporting text where needed.
- Use the existing display typeface for headings and the body typeface for controls and data.
- Separate page-level regions with consistent vertical rhythm; keep related labels, inputs, and help or error text together.
- Avoid nested decorative cards. Use cards only for genuinely bounded records or tools.

## Semantic color

- Use semantic tokens rather than raw palette classes in feature code.
- Filled primary actions use `action` with `action-foreground`; hover uses `action-hover`. Regular text must retain at least WCAG AA contrast.
- Standalone links and non-filled emphasis use `brand` and `brand-hover`, preserving the recognizable YETI blue without forcing the action background token into every context.
- Status colors communicate state only. Source badges are neutral because source is metadata, not status.
- Muted text remains readable and must not be reduced with extra opacity.

## Actions and controls

- Each active workspace has one leading action. Secondary actions must not compete visually with it.
- Use the shared `Button` component for commands.
- Icon-only actions need an accessible German name. The `icon-action` convention is at least 36×36 CSS pixels for precise pointers and 44×44 on coarse/touch pointers, including touch-capable laptops.
- Preserve compact geometry in dense planning tools unless a dedicated module explicitly changes it.

## Tables

- A record identifier is a real link to that record. Row click may remain a shortcut, but clicking a link, checkbox, or action must not trigger duplicate navigation.
- Keep selection controls and row actions in stable columns.
- Tables may scroll horizontally at narrow widths rather than compressing data into unreadable fragments.
- Status, payment state, source, and totals keep their existing meaning and precedence.

## Forms and field groups

- Every field has a visible label; placeholders supplement labels rather than replacing them.
- Group related fields with consistent spacing and keep validation or pending feedback adjacent to the relevant action.
- Do not alter defaults, validation, disabled rules, payloads, or dirty-state behavior for presentation-only work.

## Dialog and sheet anatomy

- Use dialogs for focused decisions and sheets for contextual editing that benefits from retaining the workspace behind it.
- Use one stable header, one scrollable body, and one stable footer. The title identifies the record being edited.
- Primary and cancel actions remain associated with the form even when placed in a fixed footer.
- Preserve focus trapping, focus return, Escape behavior, nested popovers, close behavior, loading states, and visible errors.

## Responsive behavior

- Toolbars wrap deliberately: search takes the available row, then actions remain reachable without clipping.
- Sheets use the full small-screen width and a constrained desktop width.
- Long identifiers and labels wrap or truncate predictably without covering adjacent controls.
- Mouse, keyboard, and touch access are all first-class; layout changes must not reorder workflow meaning.

## UI-01 implementation

UI-01 establishes the action/link color pairing, the icon-action sizing convention, neutral booking-source badges, accessible ticket links, a responsive bookings toolbar, and a right-hand payment sheet. It is intentionally limited to foundations plus the bookings/payment pilot.

## UI-02 implementation

UI-02 refines touch targets and long sheet headings, applies the established sheet anatomy to booking approval, aligns the booking-detail header and loading skeleton, and gives the wizard's final review step a single sticky desktop summary beside its existing controls. The wizard remains stacked in its existing content order on smaller screens.

UI-02 does not change approval or payment behavior, booking-detail actions, wizard state, calculations, validation, requests, or persistence. Complex ticket-edit dialogs and cross-step sticky pricing remain deferred.

## UI-03 implementation

UI-03 applies the form anatomy to the customer, instructor, course, and product dialogs: a stable readable header, one scrollable form body, and a visible footer with secondary cancel and one primary save action. Existing wide dialog widths, field order, submission wiring, close guards, photo workflow, validation, and business visibility remain unchanged.

Multi-column field groups stack at narrow widths, repeating rows can wrap without horizontal clipping, and touched icon-only remove or primary-contact controls use the shared accessible target convention. UI-03 does not standardize every form in the application or alter shared dialog behavior.

## UI-04 implementation

UI-04 applies the shared control sizing and accessible names to scheduler navigation, view/filter groups, search and settings. The selection toolbar wraps without clipping, retains one leading booking action, and keeps secondary planning actions neutral.

Scheduler booking details now use the established right-hand sheet with a stable record header, scrollable body and stable action footer. Conflict and change-confirmation dialogs remain separate sibling overlays with their existing state and handlers. Calendar bars, colors, grid geometry, density, drag/drop and booking semantics are unchanged.

UI-04 browser verification covered scheduler controls, responsive wrapping, selection-toolbar visibility, and coarse-pointer targets. Booking-detail read/edit/cancel behavior and nested conflict/change-confirmation focus and Escape behavior were verified later in UI-05A with synthetic local fixtures; see `docs/ui-verification.md`.

## Future proposals — not implemented in UI-01 through UI-04

- **Approval and detail follow-up:** review complex ticket-edit dialogs, history, and related information after their workflows receive individual review. The approval-sheet browser check was completed in UI-05A.
- **Booking wizard follow-up:** review earlier-step field grouping, error placement, and cross-step pricing without changing booking rules.
- **Scheduler follow-up:** separately review calendar type recognition, legend, geometry, density, selection, drag/drop, and touch behavior.
- **Remaining modules:** progressively adopt the standard after individual workflow review; no app-wide redesign is implied by UI-01 through UI-03.

Existing confirmation-resend, duplicate-booking, and cancellation placeholder handlers remain out of scope until their workflows are implemented separately.
## UI-05B wizard steps 1–2

The cart, product/time step, customer step and payer card follow the same control sizing (`control-target`, `icon-action`), wrap long names and contact data instead of truncating, stack the private-lesson filter row on narrow screens, and use muted neutral styling for purely informational panels. Warnings, errors and selection highlights keep their existing colours. Scheduler grid geometry and wizard behaviour are unchanged.

## UI-06 scheduler visual signals

The main scheduler's booking bars use calm neutral category surfaces for group courses and office shifts, with `Users` and `Building` icons as non-colour cues. Private lessons retain operational payment recognition: paid uses a subtle green surface and open uses a subtle amber surface. Provisional reservations keep their striped amber override, while period, shared, cross-discipline, selection and absence signals retain their established meaning and precedence.

The active compact legend rendered by `SchedulerGrid` now uses the shared `SchedulerLegend` presentation and the same static booking class function as desktop bars and mobile agenda markers. The non-compact legacy legend remains available and its existing order and membership are unchanged; its `BLOCK_COLORS` swatches are aligned to the equivalent booking types. The wizard mini-scheduler has a separate availability/ranking legend and is intentionally unchanged, as are instructor colours, blocking-bar presentation, grid geometry and drag/drop behaviour.

The shared range date picker gives its clear, previous-month and next-month icon actions exact German accessible names and the established 36px precise-pointer / 44px coarse-pointer target. Date cells and selection behaviour are unchanged.

## UI-07 scheduler workspace

The scheduler uses a compact local heading instead of the standard descriptive page header so the remaining viewport height belongs to the schedule. Date, view, fullscreen, search, settings and booking-type controls stay in one desktop row when space permits and wrap naturally on narrow screens.

Fullscreen is a visible labelled toolbar action as well as a settings option; both use the existing scheduler fullscreen state. The multi-select interaction hint is available from a focusable help action instead of permanently occupying toolbar width. Scheduler rows, slots, booking geometry, sticky regions, drag/drop and selection behaviour remain unchanged.
