# Stundenplan auf dem iPhone: Buchung reparieren und Tagesliste einführen

## Problem

Auf dem iPhone lässt sich der Stundenplan zunächst scrollen. Sobald ein freier Zeitraum angetippt wird, erscheint der blaue Auswahlrahmen aus der Desktop-Bedienung. Danach reagiert das Wischen nicht mehr zuverlässig, und die Aktionsleiste unten ist breiter als der Bildschirm, sodass "Buchung erstellen" nicht erreichbar ist.

Ursache: Die Entscheidung "Touch oder nicht" wird heute über die Zeigerart getroffen, nicht über die Bildschirmbreite, und die Desktop-Auswahl samt Aktionsleiste wird auf dem Telefon trotzdem gerendert.

## Stufe 1 — Buchen auf dem Telefon sofort wieder möglich

- Ein gemeinsames Kennzeichen für "schmaler Bildschirm" (unter 768 px) einführen und überall im Stundenplan verwenden; die Zeigerart entscheidet nur noch über Ziehen/Größenändern.
- Auf schmalen Bildschirmen wird der blaue Auswahlrahmen gar nicht mehr erzeugt oder gezeichnet; beim Wechsel auf die schmale Ansicht wird eine bestehende Auswahl verworfen.
- Kurzes Antippen eines freien Zeitraums öffnet das neue Buchungs-Fenster von unten; Wischen scrollt nur.
- Die bestehende Aktionsleiste wird als Notfall-Variante auf schmalen Bildschirmen zu einem Panel am unteren Rand umgebaut: "Buchung erstellen" volle Breite, "Abwesenheit" und "Bürodienst" unter "Mehr", "Abbrechen" daneben, mit Rücksicht auf den iPhone-Sicherheitsbereich.
- Der Übergabeweg zum Buchungsassistenten bleibt unverändert (Lehrer, Datum, Startzeit, Dauer werden vorausgefüllt).

## Stufe 2 — Tagesliste als Standardansicht auf dem Telefon

- Neue Ansicht `MobileSchedulerAgenda`: ein Tag, Lehrer untereinander, darunter chronologisch die Buchungen und die freien Zeiträume zusammengefasst (z. B. "10:00–12:00 frei" statt vieler leerer Zeilen).
- Pro Eintrag: Zeit, Kunde bzw. Gruppenname, Art (privat, Gruppe, Schule, Bürodienst, Abwesenheit), Sportart und Zahlungs-/Buchungsstatus in der bekannten Farbsprache. Schulbuchungen behalten ihre 15-Minuten-Genauigkeit.
- Lehrerabschnitte lassen sich ein- und ausklappen; Datumsnavigation, Kalender, Filter und Sortierung bleiben wie bisher.
- Antippen eines freien Zeitraums öffnet ein Fenster von unten mit Startzeit (15-Minuten-Schritte) und Dauer, begrenzt auf das, was in die Lücke passt; nach erneuter Konfliktprüfung geht es in den bestehenden Buchungsassistenten. Es wird nichts direkt gespeichert.
- Umschalter "Liste | Raster" im Kopfbereich; Liste ist Standard, die Wahl wird lokal gemerkt. Im Raster gilt derselbe Tipp-Ablauf, kein Ziehen, kein Größenändern, kein blauer Rahmen. Datum, Filter und hervorgehobener Lehrer bleiben beim Wechsel erhalten.

## Stufe 3 — Prüfen

Tests auf iPhone Safari hoch und quer, Android Chrome sowie Desktop Chrome/Safari/Firefox: Tippen gegen Wischen, Erreichbarkeit der Schaltfläche bei 320 px Breite, Vorausfüllung im Assistenten und unveränderte Desktop-Bedienung inklusive Ziehen, Größenändern und Mehrfachauswahl.

## Technische Hinweise

- Neues Flag `useIsMobileScheduler()` auf Basis von `useMediaQuery("(max-width: 767px)")` in `src/hooks/use-touch-device.ts`; verwendet in `SchedulerGrid.tsx`, `EmptySlot.tsx`, `DaySlots.tsx`, `SelectionToolbar.tsx`, `BookingBar.tsx`.
- `DaySlots.tsx` rendert `SelectionOverlay` nicht mehr, wenn das Flag aktiv ist; `SchedulerGrid.tsx` ruft `clearSelection()` beim Wechsel in die schmale Ansicht.
- Neue Dateien: `src/components/scheduler/mobile/MobileSchedulerAgenda.tsx`, `MobileAgendaInstructorSection.tsx`, `MobileSlotSheet.tsx` (auf Basis von `Sheet`/`Drawer` aus dem bestehenden UI-Satz).
- Datenquelle bleibt `useSchedulerData`; freie Intervalle werden aus `OPERATIONAL_START/END`, Buchungen, Absenzen und wiederkehrenden Blöcken über die vorhandenen Helfer in `src/lib/scheduler-utils.ts` berechnet. Konfliktprüfung über `canSelectSlot` aus `SchedulerSelectionContext`.
- Navigationsvertrag unverändert: `/bookings/new?instructor=<id>&appointments=<JSON>`.
- Ansichtswahl in `localStorage` (`scheduler.mobileView`).
- Keine Datenbankänderungen, keine Änderungen an Preisen, Verfügbarkeits- oder Konfliktregeln, keine Farbänderungen, kein Ziehen auf Touch.
