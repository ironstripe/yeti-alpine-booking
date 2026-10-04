# UI-07a shell-aware scheduler correction

## Scope
- Remove viewport-forced no-wrap behavior so the compact scheduler toolbar wraps naturally inside the actual application shell.
- Replace tooltip-only multi-select help with the existing accessible popover pattern, retaining the same help text, switch, selection state, and handlers.
- Preserve UI-08 and all scheduler data, fullscreen, selection, geometry, and business behavior.

## Verification
- Exercise real scheduler components inside an AppLayout-equivalent shell at 1440×900, 1280×720, and 1024×768 with 250px expanded and 64px collapsed sidebars, plus coarse-pointer laptop and fullscreen states.
- Check long fullscreen text, visible selection count, 36/44px targets, tap-open help, settings/fullscreen synchronization, Escape, no clipping or page overflow, and unchanged row/slot/bar geometry.
- Seed a future-date selection through existing context behavior and confirm it survives fullscreen transitions.
- Block external traffic, remove fixtures, then run TypeScript, preview build diagnostics, and diff checks.
