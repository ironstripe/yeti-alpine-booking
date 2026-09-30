# Desktop-Mehrfachauswahl freier Scheduler-Slots

## Umsetzung
- In `EmptySlot` einen gemeinsamen Handler für Desktop-Slot-Toggles verwenden.
- Rechtsklick auf einen freien Slot fängt das Browsermenü ab und wählt genau diese 60 Minuten an oder ab.
- Strg-Klick beziehungsweise Cmd-Klick nutzt denselben Handler und startet dadurch keine Ziehauswahl.
- Der Desktop-Toggle bleibt unabhängig vom Zeigegerät aktiv; nur die bestehende mobile Ansicht unter 768 px schaltet diesen Pfad ab.
- Blockierte oder belegte Slots bleiben unverändert und werden weiterhin durch die bestehende Konfliktprüfung abgelehnt.
- Bestehende Auswahlmarkierung und Auswahlleiste bleiben die sichtbare Rückmeldung.
- Den vorhandenen beschrifteten Mehrfachauswahl-Schalter aus dem Bereich unterhalb des Stundenplans in die stets sichtbaren oberen Scheduler-Steuerelemente verschieben.
- Dort den Hinweis „Strg/⌘ + Klick oder rechte Maustaste“ anzeigen und die bisherige untere Instanz entfernen, sodass es keine doppelte Steuerung gibt.

## Unverändert
- Normaler Desktop-Klick und Ziehen, Shift-Auswahl, Escape/Abbrechen und gespeicherter Entwurf.
- Mobile- und Touch-Bedienung.
- Bestehende Buchungen, Buchungsschritte, Preise, Daten, Benachrichtigungen und Drag-and-drop.

## Prüfung
- Fokussierte Tests für den gemeinsamen Toggle-Pfad ergänzen, soweit ohne UI-Umbau möglich.
- Typprüfung, relevante Tests und Vorschau-Build prüfen; dabei Desktop-Breite mit grobem Zeiger sowie den mobilen Grenzwert unter 768 px berücksichtigen.
