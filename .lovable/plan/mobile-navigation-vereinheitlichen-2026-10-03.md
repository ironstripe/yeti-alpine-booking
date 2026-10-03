# Mobile Navigation vereinheitlichen

## Umsetzung
- Eine gemeinsame Navigationsdefinition für Desktop, mobiles Hauptmenü und „Mehr“ erstellen.
- „Einstellungen“ mit bestehendem Symbol und `/settings` in beide mobilen Menüs aufnehmen.
- Die vier primären unteren Tabs unverändert lassen; alle übrigen Ziele aus der gemeinsamen Definition ableiten.
- Aktive Zustände und mobile Seitentitel auch für Unterseiten über Pfad-Präfixe korrekt bestimmen.
- Echte ungelesene Posteingangs-Zahl in allen Menüs verwenden und den festen Wert `3` entfernen.
- Beide mobilen Menüs auf kurzen Bildschirmen scrollbar halten und nach Navigation schliessen.

## Prüfung
- Fokussierte Typ-/Lint-Prüfungen und den Projekt-Build ausführen.
- Die Navigation bei 390×844 und 375×667 im Browser prüfen, soweit der vorhandene Zugang reicht.
- Desktop-Navigation und die vier primären unteren Tabs gegen Regressionen prüfen.

## Grenzen
- Nur Navigation; keine Daten-, Rollen-, Berechtigungs- oder Backend-Änderungen.
- Keine Veröffentlichung.
