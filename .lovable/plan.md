# Diagnose- und Korrekturplan: „Später zuweisen“ ohne Zeitfenster

## Beobachtete Fakten

- Der Screenshot belegt die neue Oberfläche: „Später zuweisen“ ist aktiv, der Stundenplan ist verborgen und der Teilnehmerbereich sichtbar. Er belegt **nicht**, ob oberhalb ein Zeitwert gewählt war.
- Ein neuer Warenkorbposten startet korrekt ohne Zeit: `timeSlot` und `duration` sind `null` (`BookingWizardContext.tsx:147–179`); die lokalen Felder übernehmen nur ein vorhandenes `state.timeSlot` (`Step2ProductAllocation.tsx:120–134`). Ein Datum plus „Später zuweisen“ kann daher legitim noch kein Zeitfenster haben.
- „Später zuweisen“ entfernt ausschließlich Lehrpersonen und erhält Datum, Zeit, Dauer und Teilnehmer (`assignLaterState.ts:22–52`, abgesichert in `assignLaterState.test.ts:35–50`). Es setzt keine Zeit und darf das auch nicht.
- Der sichtbare Teilnehmerbutton ist genau bei fehlendem Start **oder** Ende deaktiviert (`Step2ProductAllocation.tsx:852–873`). „Weiter“ bleibt im gezeigten Ablauf zunächst wegen fehlender Teilnehmer gesperrt; `canProceed` verlangt Teilnehmer und Lehrperson oder `assignLater` (`BookingWizardContext.tsx:1505–1528`).
- Die Zeitfelder liegen oberhalb des Teilnehmerbereichs (`Step2ProductAllocation.tsx:698–760`), während Kopf und Fuss am Viewport haften (`BookingWizard.tsx:535–594, 601–621`). Der Hinweis bietet derzeit weder Sprung noch Fokus zurück zu den benötigten Feldern.

## Bestätigte Zustandsrisiken — getrennt vom normalen leeren Startzustand

1. Wird nach einem vollständigen Zeitfenster ein späterer/gleicher Start gewählt, setzt die Oberfläche nur `endTime` lokal auf `null` (`Step2ProductAllocation.tsx:713–720`). Der Effekt schreibt oder löscht `state.timeSlot`/`duration` aber nur, wenn **beide** lokalen Werte vorhanden sind (`233–259`). Dadurch können Oberfläche und Warenkorbstatus auseinanderlaufen.
2. Beim Wechsel zu einem Warenkorbposten ohne Zeit wird `state.timeSlot` korrekt auf `null` geladen (`BookingWizardContext.tsx:540–552, 218–245`), der Synchronisationseffekt behandelt externe `null`-Werte jedoch nicht (`Step2ProductAllocation.tsx:261–282`). Die sichtbaren lokalen Zeitwerte des vorherigen Postens können stehen bleiben.
3. Dasselbe Muster gilt, wenn ein kanonischer Plan geleert oder ein Scheduler-Prefill verworfen wird und dadurch `timeSlot` auf `null` fällt (`privatePlan.ts:41–67`; `BookingWizardContext.tsx:1411–1433`).
4. Datumsänderungen und `assignLater` selbst löschen eine vorhandene Zeit nicht (`BookingWizardContext.tsx:670–704`; `assignLaterState.ts:28–52`). Das ist normales, gewünschtes Verhalten und keine Erklärung für einen frischen Ablauf ohne Zeit.
5. `canProceed` prüft bei Privatlektionen Zeit/Produkt-ID nicht ausdrücklich (`BookingWizardContext.tsx:1519–1527`). Im normalen leeren Ablauf blockiert der Teilnehmerdialog indirekt; bei bereits zugeordneten Teilnehmern könnte ein inkonsistenter Posten sonst weiterkommen. Das ist eine separate Validierungslücke.

## Kleinste Reproduktion ohne Schreibzugriffe

In der echten Oberfläche mit blockierten externen Schreibzugriffen jeweils sichtbare Felder **und** internen Warenkorbstatus vergleichen:

1. Frisch: Privat → Datum → „Später zuweisen“; Start/Ende fehlen legitim, Teilnehmerbutton bleibt aus.
2. Nur Start wählen; Ende und Teilnehmerbutton bleiben aus.
3. Start + Ende wählen; Zeit erscheint im Teilnehmerblock, Button wird aktiv.
4. Bestehendes 12–14 → „Später zuweisen“ an/aus; 12–14 muss erhalten bleiben.
5. Bestehendes 12–14 → Start auf 14 ändern; Ende muss leer werden und auch gespeichertes `timeSlot`/`duration` müssen leer werden.
6. Datum ändern sowie zurück/vor navigieren; Zeit bleibt konsistent erhalten.
7. Zwischen einem Posten mit 12–14 und einem neuen Posten ohne Zeit wechseln; jeder Posten zeigt ausschließlich seinen eigenen Zustand.

## Empfohlene minimale Lösung

### 1. Zuerst die einfachere UX-Korrektur

Im sichtbaren Teilnehmerblock bei fehlender Zeit einen aktiven sekundären Befehl **„Zeitfenster wählen“** statt nur des passiven Hinweises zeigen. Dieser scrollt die bestehenden Start-/Ende-Felder unter den haftenden Kopf, setzt den Fokus auf das erste fehlende Feld und hebt den Zeitbereich kurz als erforderlich hervor. Der Teilnehmerbutton bleibt bis Start **und** Ende deaktiviert.

Das ist kleiner und sicherer als doppelte Zeit-Auswahlfelder im Teilnehmerblock: keine zweite Bedienoberfläche, keine zusätzliche Synchronisation und keine Gefahr unterschiedlicher Werte. Falls der Sprung im mobilen Kurz-Viewport trotz Fokus nicht ausreichend verständlich ist, wäre als zweite Wahl dieselbe bestehende Zeit-Auswahl direkt im Block zu rendern — nicht eine neue Kopie mit eigenem Zustand.

### 2. Zustandskorrektur separat

- Lokale Start-/Endwerte und `state.timeSlot`/`duration` bidirektional auch bei `null` synchronisieren.
- Sobald Start oder Ende unvollständig wird, den gespeicherten Slot und die Dauer ausdrücklich leeren; keine alten Preise oder Zeiten weiterverwenden.
- Beim Warenkorbwechsel und beim Leeren eines kanonischen Plans lokale Werte aus dem aktiven Posten vollständig ersetzen.
- `canProceed` für Privatlektionen zusätzlich an ein vollständiges, gültiges Zeitfenster und die daraus bestimmte Produktkonfiguration binden; Teilnehmer bleiben weiterhin zwingend.

## Verifikation

Die sieben Übergänge oben auf kurzem Desktop und 390-px-Mobilansicht prüfen. Zusätzlich bestätigen: keine erfundene Uhrzeit/Dauer, kein stiller Preis, „Später zuweisen“ betrifft nur die Lehrperson, „Weiter“ bleibt ohne Teilnehmer gesperrt, zugewiesener Ablauf bleibt unverändert. Keine Datenbank-, Server-, Deployment- oder Veröffentlichungsänderung.
