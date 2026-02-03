

# Update Onboarding Dialog for Latest Features

## Overview

Update the `OnboardingDialog` to reflect the latest functional changes and present the most important features to new office/admin users.

## Current State

The existing onboarding covers:
1. Willkommen bei YETY
2. Buchungen erstellen
3. KI-Posteingang
4. Kurse & Lehrer
5. Einstellungen

**Missing key features:**
- Stundenplan (visual scheduler - central tool)
- Skilehrer-Verwaltung (instructor management with new recurring blocks)
- Events (newly added)
- Shop & Gutscheine

## Proposed Changes

### File: `src/components/onboarding/OnboardingDialog.tsx`

Update the `ONBOARDING_STEPS` array to reflect the current feature set and workflow:

```typescript
const ONBOARDING_STEPS = [
  {
    title: 'Willkommen bei YETY',
    description: 'Ihr Buchungssystem für die Skischule. Lassen Sie uns die wichtigsten Funktionen durchgehen.',
    icon: LayoutDashboard,
  },
  {
    title: 'Stundenplan',
    description: 'Der visuelle Stundenplan zeigt alle Buchungen und Skilehrer auf einen Blick. Ziehen Sie Buchungen per Drag & Drop.',
    icon: LayoutGrid,
  },
  {
    title: 'Buchungen erstellen',
    description: 'Erstellen Sie Buchungen für Privat- und Gruppenkurse. Der Wizard führt Sie Schritt für Schritt durch den Prozess.',
    icon: Calendar,
  },
  {
    title: 'KI-Posteingang',
    description: 'E-Mails und Anfragen werden automatisch analysiert. Prüfen Sie die extrahierten Daten und erstellen Sie Buchungen mit einem Klick.',
    icon: Inbox,
  },
  {
    title: 'Skilehrer-Verwaltung',
    description: 'Verwalten Sie Skilehrer, Abwesenheiten und wiederkehrende Blockzeiten. Sehen Sie auf einen Blick, wer verfügbar ist.',
    icon: UserCheck,
  },
  {
    title: 'Einstellungen',
    description: 'Passen Sie Produkte, Preise, E-Mail-Vorlagen, Benutzer und mehr an Ihre Bedürfnisse an.',
    icon: Settings,
  }
];
```

### Key Updates

| Step | Old | New |
|------|-----|-----|
| 2 | Buchungen erstellen | **Stundenplan** (key visual tool) |
| 3 | KI-Posteingang | Buchungen erstellen |
| 4 | Kurse & Lehrer | KI-Posteingang |
| 5 | Einstellungen | **Skilehrer-Verwaltung** (incl. recurring blocks) |
| 6 | - | Einstellungen |

### Import Updates

Add missing icon imports:

```typescript
import { 
  Calendar, Users, Inbox, Settings, LayoutDashboard,
  ChevronRight, ChevronLeft, Check,
  LayoutGrid, UserCheck  // NEW imports
} from 'lucide-react';
```

## Summary

- **6 steps** instead of 5 (add Stundenplan and expand Skilehrer)
- Emphasizes the **visual scheduler** as a key differentiator
- Mentions **recurring blocks** in instructor management
- Better reflects the actual daily workflow: Scheduler > Bookings > Inbox > Instructors

