# UI-06 scheduler visual signals

## Scope
- Update only the static scheduler booking palette and direct presentation consumers so desktop bars, mobile markers, and the active desktop legend agree.
- Keep booking type/status branching, paid truthiness, provisional precedence, conflict/cancellation meaning, geometry, interactions, and all data behavior unchanged.
- Add a neutral group-type icon to booking bars and accessible Swiss-German labels plus shared action sizing to the range date picker controls.
- Record actual component reach, measured contrast, fixture coverage, and remaining untested scope in the UI docs and roadmap.

## Verification
- Use temporary synthetic local fixtures with all remote traffic blocked to render actual booking bars, the active legend path, mobile agenda, and range date picker in light/dark at 1440px and 390px, including short bars and long labels.
- Compare booking bar positions and dimensions with the reviewed baseline; measure computed composited text/background contrast; confirm date-picker accessible names, 36/44px targets, and unchanged clear callback wiring.
- Remove fixtures, then run focused tests where available, TypeScript, build diagnostics, and diff review. Do not publish or perform writes.

## Technical notes
- `getBookingBarClasses` is the live desktop/mobile booking palette; `BLOCK_COLORS` currently reaches only `SchedulerLegend`, which is mounted by the main `SchedulerGrid` when enabled. Mini-scheduler uses a separate operational ranking legend and is not part of this palette.
- Instructor availability colors, absences, selection/focus styles, grid geometry, drag/drop, and scheduler calculations remain untouched.
