# B07 Vorbereitung: mehrere Positionen in einer Office-Buchung, atomar gespeichert (nur Diagnose und Entwurf)

Basis-SHA: `4986bc9a6e7725af94bc93a2724faa2ab13c75e8`. Läuft nach B06. Keine Code-, Schema-, Deploy-, Versand- oder Live-Änderungen. Umsetzung erst, wenn die Preisentscheidungen D01 vorliegen.

## Ist-Zustand (geprüft)

- `Step4Summary.tsx:142` `multiItemBlocked` sperrt das Speichern bei `cartItems.length > 1`. Zusätzlich `staffGroupPayload.ts:37` (Winter-26/27-Gruppe nur einzeln), Hinweise in `Step1ProductCart.tsx:90`, `Step2AssignCustomer.tsx:69`, `BookingWizard.tsx:618`.
- `useCreateBooking.ts` kennt zwei getrennte Wege: privat `paCreate` (Z. 378, Edge `private-appointments`, danach `pa_create_booking(p, actor)` / `pa_create_booking_finalized`) und quellgebundene Gruppe `createStaffGroupBooking` (Z. 155, Edge `staff-group-booking`, danach `bc_2627_staff_group_book(p, actor)`). Jeder Weg legt sein eigenes Ticket an und hat einen eigenen Wiederholschutz (`private_appointment_submissions` bzw. `bc_2627_staff_group_submissions`) mit Lock auf `submission_key`.
- Abschluss: `staff_booking_finalize(p_ticket, f, actor)` (0006), B05 `b05_office_create` steht als ausstehendes SQL bereit (nicht installiert); B04/B06 SQL ebenfalls ausstehend.
- Preis heute: `pa_price(date,start,end,persons)` summiert pro voller Stunde den Satz aus `private_lesson_rates` (4 Zeilen: 09–10 75, 10–12 85, 12–14 75, 14–16 85) plus `(Personen−1) × Stunden × 20`, Personen auf 4 begrenzt, Minuten werden ignoriert. Rabatt in `pa_create_booking` ist ein manueller `discount_percent` mit Begründung. Eine automatische 10%-Regel ist dort nicht eingebaut.
- `public_private_tariff_display`: 2 Produkte, nur zur Anzeige. Sie enthalten Zeitfenster (z. B. 09–10 CHF 75 + 20 pro Person) und die Rabattregel `same_participant_same_day`, 10%, Schwelle 4 (Einheit `lessons`). Für Buchungen gelten sie nicht.
- Gruppe: `quote_bc_2627_product(product, items, participants)` mit Preisstufen und Mittagessen (CHF 30 pro Person und Tag, eigene Rechnungszeile).

## Abhängigkeiten

```text
Wizard state (cartItems, participantBookings, groupPlan, B01 checkout)
  -> Step4Summary.handleCreateBooking
     -> useCreateBooking
        private   -> paCreate -> private-appointments fn -> pa_create_booking(_finalized) -> pa_price, pa_slot_conflicts, pa_lock_slots
        BC group  -> staff-group-booking fn -> groupBookingPreflight -> bc_2627_staff_group_book -> quote_bc_2627_product, lunch
        finalize  -> staff_booking_finalize (+ B05 intent: b05_office_create, pending)
  post-commit -> staff-booking-confirmation (B05) / send-invoice (B06) via courseDelivery (B04)
```

Für einen echten atomaren Ablauf taugen die bestehenden Helfer so nicht: Beide RPCs erstellen Ticket und Wiederholschutz selbst. Zwei Aufrufe nacheinander wären nicht atomar, und gegenseitig löschen (Kompensation) ist ausdrücklich ausgeschlossen.

## B07a: atomarer Server-Abschluss (nach D01)

1. Neues, ausstehendes SQL ohne Nummer: `b07_office_multi_create(p jsonb, actor)`, nur für service_role. Ablauf:
   - ein Wiederholschutz `b07_office_submissions(submission_key, ticket_id)`, Lock auf den Schlüssel;
   - ein Ticket für einen Zahler;
   - `draft_participants` werden einmal angelegt, jede Entwurfs-ID genau einmal einer echten ID zugeordnet und in allen Positionen weiterverwendet;
   - pro Position den bestehenden internen Baustein aufrufen.
2. Dafür werden die bestehenden RPCs aufgeteilt (Refactor ohne Verhaltensänderung): `pa_create_booking_core(ticket, …)` und `bc_2627_staff_group_book_core(ticket, …)` arbeiten auf einem vorgegebenen Ticket ohne eigenen Wiederholschutz. Die heutigen Einzel-RPCs werden zu dünnen Hüllen darum. Wächter, Konflikte, Später zuweisen, Rollen und Besitzrechte bleiben im Baustein.
3. Konflikte: Alle Slots aller Positionen werden vor dem ersten Schreiben in fester Reihenfolge gesperrt (`pa_lock_slots`). Verschiedene Personen zur selben Zeit sind erlaubt. Dieselbe Person doppelt zur selben Zeit: Es gilt die bestehende Regel von `pa_slot_conflicts`, ohne Lockerung.
4. Ein Gesamtbetrag = Summe der gespeicherten Zeilen. Danach `staff_booking_finalize` einmal und die B05-Absicht einmal pro Ticket. Kein Anbieteraufruf innerhalb der Transaktion.
5. Ausdrücklich nicht unterstützt (Fehler mit Begründung, nie stilles Weglassen): Altpositionen ohne kanonischen Pfad, nicht quellgebundene Gruppen, Mischungen aus Bearbeiten und Neu, Trainings/interne Kurse, unbekannte Positionsarten, Position ohne Teilnehmer.
6. Edge: neuer Modus `multi_create` in `private-appointments` oder eine neue Staff-Funktion `office-booking` mit `requireRole(["admin","office"])` und Serverangebot. Das wird beim Umsetzen entschieden; bevorzugt eine neue, kleine Funktion.

## B07b: Oberfläche und isolierte Abnahme

- `useCreateBooking`: Bei mehr als einer Position wird ein Datensatz aus den Positionen gebaut und an den neuen Endpunkt geschickt. Der Pfad mit genau einer Position bleibt unverändert.
- `multiItemBlocked` und die Gruppen-Sperre werden nur für unterstützte Kombinationen aufgehoben. Für alles Übrige bleibt der Hinweis.
- Vor dem Speichern zeigt die Zusammenfassung das Serverangebot pro Position und den Gesamtbetrag und verlangt eine Bestätigung. Bei abweichendem Angebot wird gestoppt.
- Erfolg zeigt das gespeicherte Ticket. Der Versandstatus (B05/B06) wird getrennt angezeigt.

## D01: offene Preisfragen (Entscheid Ivo)

Was der Code heute tut, ist eine Sache. Was davon geschäftlich gelten soll, muss entschieden werden.

1. Welcher Tarif gilt für operative Buchungen? Heute rechnet `pa_price` 2h zwischen 10 und 12 mit 170 CHF (85+85), 1 Person. Die Website zeigt dafür 190 CHF für 2h. Frage: Bleibt `private_lesson_rates` die Quelle (nichts ändert sich) oder wird es die Anzeigetabelle? Ohne Antwort ändert B07 keine Preise.
2. 10%-Regel, automatisch oder nicht: Heute gibt es nur einen manuellen Rabatt. Soll B07 die bestätigte Regel automatisch anwenden? Beispiel: Anna 09–11 und 14–16 am 2.1. = 4h, also 10% auf Annas Lektionen an diesem Tag. Ben 3h am selben Tag: kein Rabatt. Anna 2h am 2.1. und 2h am 3.1.: kein Rabatt.
3. Geteilte Lektion: Anna und Ben zusammen 10–14 (4h, 2 Personen). Haben beide je 4h? Und gilt der Rabatt auf den ganzen Zeilenpreis (Grundpreis + Zuschlag)? Eine Aufteilung pro Person wird nicht erfunden. Wir brauchen eine Antwort.
4. Zählweise: Zählen Stunden des Stundenplans (10–12 = 2h) oder Lehrminuten (115 min)? Bei Lehrminuten erreicht 2×2h nur 230 und nicht 240.
5. Zusammenspiel: Werden automatische 10% und manueller Rabatt kombiniert, ersetzt einer den anderen, oder ist das gesperrt? Und zählen Gruppenkurse oder Mittagessen zur 4h-Schwelle (Vorschlag: nein)?
6. Wird die Personengrenze von 4 in `pa_price` bestätigt (5. Person ohne Zuschlag)?

## Versand B05/B06

Erst wird die Buchung gespeichert, dann eine Absicht pro Ticket festgehalten. Bestätigung und Rechnung laufen danach über die B04-Zustellung (Ticket + Art + `invoice_id`). Ein Wiederholaufruf liefert dasselbe Ticket und keine zweite Zustellung. Ein Fehler beim Versand macht die Buchung nie rückgängig. Bestehende Rechnungen, Zahlungen und gefrorene Inhalte bleiben unberührt.

## Tests (lokal, synthetisch)

- Baseline + B04/B05/B06 + B07-SQL in lokalem Postgres/PostgREST.
- Fehler bei Position 2: Nichts wird gespeichert (kein Ticket, keine Teilnehmer, keine Zeilen).
- Wiederholung oder verlorene Antwort: genau ein Ticket.
- Zwei gleichzeitige Anfragen mit demselben Schlüssel oder demselben Slot: Eine gewinnt.
- Verschiedene Personen zur gleichen Zeit: OK. Gleiche Person: Konflikt.
- Eine Entwurfsperson in zwei Positionen: genau eine Teilnehmer-ID.
- Später zuweisen, Mittagessen und Preisstufen unverändert.
- Regression für eine einzelne Position, B01–B06.
- Browser mit abgefangenen Anfragen auf Desktop und Mobil.

## Rückbau

Zuerst die Nutzer zurückbauen: Oberflächen-Schalter aus, dann die Edge-Funktion entfernen, dann die B07-SQL-Funktion entfernen. Die Wiederholschutz-Tabelle und Protokolle bleiben erhalten. Die `_core`-Aufteilung lässt die Einzel-RPCs gleich; der Rückbau stellt die alten Definitionen wieder her.

## Blocker

- D01-Fragen 1–6.
- B04/B05/B06 SQL und Funktionen noch nicht installiert. Sie sind die Voraussetzung für das Release.
- B02-Retest auf der gehosteten Version ist weiterhin nicht abgenommen.
