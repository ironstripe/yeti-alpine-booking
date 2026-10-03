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

## Future proposals — not implemented in UI-01 through UI-04

- **Approval and detail follow-up:** review complex ticket-edit dialogs, history, and related information after their workflows receive individual review. The standalone UI-02 approval-sheet browser check remains pending.
- **Booking wizard follow-up:** review earlier-step field grouping, error placement, and cross-step pricing without changing booking rules.
- **Scheduler follow-up:** separately review calendar type recognition, legend, geometry, density, selection, drag/drop, and touch behavior.
- **Remaining modules:** progressively adopt the standard after individual workflow review; no app-wide redesign is implied by UI-01 through UI-03.

Existing confirmation-resend, duplicate-booking, and cancellation placeholder handlers remain out of scope until their workflows are implemented separately.