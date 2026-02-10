

# Rename "Training(s)" Labels to "Kurs(e)"

Replace all user-facing labels that say "Training" or "Trainings" with the equivalent "Kurs" or "Kurse". Only UI-visible strings are changed -- variable names, file names, and route paths stay as-is.

## Changes by File

| File | Old Label | New Label |
|------|-----------|-----------|
| **AppSidebar.tsx** (line 42) | `"Trainings"` | `"Kurse"` |
| **MobileHeader.tsx** (line 31) | `"Trainings"` nav title | `"Kurse"` |
| **MobileHeader.tsx** (line 46) | `"Trainings"` page title | `"Kurse"` |
| **BottomNav.tsx** (line 35) | `"Trainings"` | `"Kurse"` |
| **TrainingsLayout.tsx** (line 41) | `title="Trainings"` | `title="Kurse"` |
| **Trainings.tsx** (line 93) | `'Training löschen'` | `'Kurs löschen'` |
| **Trainings.tsx** (line 104) | `'Training gelöscht'` | `'Kurs gelöscht'` |
| **Trainings.tsx** (line 111) | `'Das Training konnte nicht gelöscht werden.'` | `'Der Kurs konnte nicht gelöscht werden.'` |
| **Trainings.tsx** (line 124) | `'Neues Training'` | `'Neuer Kurs'` |
| **TrainingsEmptyState.tsx** (line 22) | `'Keine Trainings gefunden'` | `'Keine Kurse gefunden'` |
| **TrainingsEmptyState.tsx** (line 25) | `'...keine Trainings gefunden.'` | `'...keine Kurse gefunden.'` |
| **TrainingsEmptyState.tsx** (line 32) | `'Noch keine Trainings'` | `'Noch keine Kurse'` |
| **TrainingsEmptyState.tsx** (line 35) | `'...wiederkehrendes Training...'` | `'...wiederkehrenden Kurs...'` |
| **TrainingsEmptyState.tsx** (line 40) | `'Erstes Training erstellen'` | `'Ersten Kurs erstellen'` |
| **TrainingFormModal.tsx** (line 249) | `'Training bearbeiten'` | `'Kurs bearbeiten'` |
| **TrainingFormModal.tsx** (line 251) | `'Training duplizieren'` | `'Kurs duplizieren'` |
| **TrainingFormModal.tsx** (line 252) | `'Neues Training erstellen'` | `'Neuen Kurs erstellen'` |
| **TrainingFormModal.tsx** (line 258) | `'...dieses Trainings.'` | `'...dieses Kurses.'` |
| **TrainingFormModal.tsx** (line 260) | `'...dieses Trainings...'` | `'...dieses Kurses...'` |
| **TrainingFormModal.tsx** (line 261) | `'...neues Training für Gruppenkurse...'` | `'...neuen Kurs für Gruppenkurse...'` |
| **TrainingFormModal.tsx** (line 747-748) | `'Keine Produkte für Trainings verfügbar...Für Trainings verfügbar'` | `'Keine Produkte für Kurse verfügbar...Für Kurse verfügbar'` |
| **TrainingFormModal.tsx** (line 853) | `'Training ist aktiv'` | `'Kurs ist aktiv'` |
| **TrainingFormModal.tsx** (line 868) | `'Training erstellen'` | `'Kurs erstellen'` |
| **ProductFormModal.tsx** (line 537) | `'Für Trainings verfügbar'` | `'Für Kurse verfügbar'` |
| **ProductFormModal.tsx** (line 540) | `'...mit Trainings verknüpft...'` | `'...mit Kursen verknüpft...'` |
| **ProductFormModal.tsx** (line 554-555) | `'...mit Trainings verknüpft...Trainings verwendet.'` | `'...mit Kursen verknüpft...Kurse verwendet.'` |
| **SettingsProducts.tsx** (line 136) | `'Training'` column header | `'Kurs'` |
| **SettingsProducts.tsx** (line 211) | `'Kann mit Trainings verknüpft werden'` | `'Kann mit Kursen verknüpft werden'` |
| **LaunchChecklist.tsx** (line 40) | `'Mindestens ein Training definiert'` | `'Mindestens ein Kurs definiert'` |
| **empty-state.tsx** (line 86) | `'Keine Trainings'` | `'Keine Kurse'` |
| **empty-state.tsx** (line 87) | `'...Erstellen Sie Ihr erstes Training.'` | `'...Erstellen Sie Ihren ersten Kurs.'` |

## What stays unchanged

- All file names (e.g., `TrainingCard.tsx`, `TrainingFormModal.tsx`)
- All variable/type names (e.g., `isTrainingProduct`, `trainingTabs`)
- All route paths (`/trainings`, `/trainings/planning`, etc.)
- Code comments
- The word "Weiterbildung" in `InstructorAvailability.tsx` (different meaning)
