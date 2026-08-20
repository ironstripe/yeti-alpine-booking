# Workflow Sprint: Stundenplan & Buchungs-Workflow

Drei Verbesserungen am Stundenplan (Scheduler) und am Buchungsassistenten.

## Task 1 – Kontext vom Stundenplan in den Assistenten übernehmen

Heute wird beim Klick auf einen freien Slot eine Auswahl erzeugt; erst über die Auswahl-Leiste ("Buchung erstellen") gelangen Datum, Zeit und Lehrer als URL-Parameter in den Assistenten. Der Assistent liest diese Parameter bereits, zeigt sie aber nicht sichtbar an und verliert sie in Schritt 2/3 teilweise (Produkt-/Zeitauswahl überschreibt Vorbelegung, `assignLater` wird zurückgesetzt).

Umsetzung:
- Einfacher Klick auf einen freien Slot: Auswahl bleibt bestehen, zusätzlich Direkt-Weg "Buchung erstellen" (Doppelklick bzw. Kontext-Button im Hover-Plus), der ohne Umweg mit Datum, Startzeit, Endzeit und Lehrer-ID navigiert.
- Vorbelegung im Assistenten so absichern, dass Produktwechsel in Schritt 2 die vorbelegten Termine/Zeiten nicht löscht und der Lehrer in Schritt 3 gesetzt bleibt.
- Sichtbarer Hinweis-Banner im Assistenten: "Aus Stundenplan übernommen: Mo, 12.01. · 10:00–11:00 · Lehrer A" mit Möglichkeit, die Vorbelegung zu verwerfen; vorbelegte Felder erhalten ein Badge.

## Task 2 – Vertikale Mehrtagesauswahl

Aktuell funktioniert Ziehen nur horizontal innerhalb eines Tages (Drag ist an einen Tag gebunden); mehrere Tage gehen nur über Shift-/Ctrl-Klick.

Umsetzung:
- Drag-Logik so erweitern, dass beim Ziehen über Tagesgrenzen (Mehrtages-Ansicht und Lehrer-Fokus-Ansicht) derselbe Zeitbereich für alle überstrichenen Tage desselben Lehrers ausgewählt wird.
- Live-Vorschau: alle betroffenen Tag/Zeit-Zellen werden während des Ziehens markiert, blockierte Tage (Abwesenheit, bestehende Buchung, Vergangenheit) werden rot dargestellt und beim Loslassen übersprungen.
- Die Auswahl-Leiste zeigt weiterhin Anzahl Slots, Stunden und Tage; "Buchung erstellen" übergibt alle Tage als Terminliste, sodass der Assistent automatisch eine Mehrtagesbuchung (Periode) vorbereitet.

## Task 3 – Blocktyp "Gruppenkurs Reserve"

Umsetzung auf Basis der bestehenden wiederkehrenden Blöcke und Abwesenheiten:
- Neuer Preset-/Blocktyp `group_reserve` mit Bezeichnung "Gruppenkurs Reserve" in der Schnellauswahl und im Dialog der wiederkehrenden Blöcke (Lehrer-Detailseite) sowie als Auswahl beim Blockieren direkt aus dem Stundenplan.
- Eigene Darstellung im Stundenplan: gestreifter Block in einer eigenen Farbe (nicht Grau wie "Nicht verfügbar", nicht Lila wie Bürodienst) inklusive Label und Eintrag in der Legende.
- Buchungslogik: Slots mit Reserve-Block gelten für private Buchungen als blockiert (Auswahl im Stundenplan und Vorbelegung im Assistenten verhindern die Zuweisung, inkl. Hinweistext).
- Gruppenkurse bleiben erlaubt: bei der Zuweisung eines Lehrers zu einem Gruppenkurs/Wochenplan wird ein Reserve-Block nicht als Konflikt gewertet; überschneidet sich ein zugewiesener Gruppenkurs mit dem Reserve-Block, wird der Reserve-Block für diesen Zeitraum im Stundenplan durch den Gruppenkurs ersetzt (Reserve-Block bleibt als Regel bestehen, wird an diesem Tag aber nicht mehr angezeigt).

## Technische Hinweise

- Betroffene Dateien: `src/contexts/SchedulerSelectionContext.tsx` (Drag über Tage), `src/components/scheduler/EmptySlot.tsx`, `SelectionToolbar.tsx`, `SingleDayInstructorRow.tsx`/`InstructorWeekBlock.tsx`, `BlockingBar.tsx`, `SchedulerLegend.tsx`, `src/hooks/useSchedulerData.ts` (Expansion der Blöcke inkl. `preset_type`), `src/components/instructor/RecurringBlockDialog.tsx` + `RecurringBlocksTab.tsx`, `src/pages/BookingWizard.tsx` und `src/contexts/BookingWizardContext.tsx`.
- `SchedulerAbsence` erhält ein Feld für die Blockart (`presetType`/`blockKind`), damit Reserve-Blöcke unterscheidbar gerendert und in Validierungen anders behandelt werden können.
- Keine neuen Tabellen nötig: `instructor_recurring_blocks.preset_type` speichert `group_reserve`; bestehende Blöcke bleiben unverändert.
- Für die Gruppenkurs-Ausnahme wird die Konfliktprüfung bei der Lehrerzuweisung (Wochenplanung/Tageszuweisung) um einen Filter erweitert, der Reserve-Blöcke ignoriert.
