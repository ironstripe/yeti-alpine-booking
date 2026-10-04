# UI-08 calm lists and documents

## Scope
- Replace the six tall document tiles with one compact semantic six-row list inside the existing available-lists section.
- Keep every existing title, subtitle, count, count label, preview handler, and exact zero-count disabled rule unchanged.
- Add neutral small icons, aligned quiet counts, outline create actions, and responsive wrapping without horizontal overflow.
- Add accessible German names and existing 36/44px sizing to date arrows; visually compact batch print and notes while preserving every control and handler.
- Document the known ticket-overview and batch-print behavior without changing it.

## Verification
- Mount the real page/components with isolated synthetic zero and nonzero data at 1440×900, 1024×768, and 390×560 in light/dark.
- Block external traffic; verify six zero-state buttons disabled, nonzero actions open their original previews, targets are 36/44px, and no content clips or overflows.
- Do not print or invoke live writes. Remove fixtures, then run TypeScript, preview build diagnostics, and diff checks.

## Technical notes
- Presentation-only changes are limited to `Lists.tsx`, `DocumentCard.tsx`, `BatchPrintCard.tsx`, and UI documentation/roadmap.
- No hooks, defaults, counts, preview props, state, handlers, dependencies, or backend behavior will change.
