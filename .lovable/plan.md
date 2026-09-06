# Plan: Anonyme Reservierung + verbindliche Bestätigung (YETI-Seite)

Dieser Plan betrifft nur YETI (Phase 1 des Auftrags). Die Website-Änderungen (Phase 2) liegen im anderen Projekt und werden hier nur als Vertrag bereitgestellt.

## Was heute passiert (geprüft)

- Beim Halten eines Termins verlangt YETI zwingend Kunde + Teilnehmer. Dadurch entstehen echte Datensätze mit Platzhalternamen: aktuell **4 Platzhalter-Kunden** (`reservierung+…@schneesportschule.li`) und **4 Platzhalter-Teilnehmer** ("Teilnehmer …") in der Datenbank.
- Die Bestätigung nimmt Kunden- und Teilnehmerdaten gar nicht entgegen — sie werden verworfen, die Platzhalter bleiben an der Buchung hängen.
- Buchungen können derzeit keinem Ticket ohne Kunde zugeordnet werden (Kundenfeld ist Pflichtfeld).
- Die Zahlungserfassung bei Onlinezahlung schreibt in Felder, die es in der Zahlungstabelle nicht gibt (Referenz/Status) — die Zahlung wird deshalb aktuell **nicht** gespeichert, der Fehler wird nur ins Log geschrieben.

## Änderungen an der Datenbank (eine Migration)

- Kundenfeld am Ticket darf leer sein, solange der Status `provisional` oder `payment_pending` ist (Prüfung per Trigger, damit bestätigte Buchungen weiterhin immer einen Kunden haben).
- Neue Felder am Ticket: `participant_count` (Anzahl Personen der Reservierung) und `finalized_at` (für Idempotenz).
- Zahlungstabelle: Felder für Zahlungsreferenz und Zahlungsstatus ergänzen, plus eindeutiger Index auf (Ticket, Referenz), damit dieselbe Zahlung nie doppelt entsteht.
- Rechnungen: eindeutiger Index auf Ticket für offene Rechnungen, damit pro Buchung genau eine Rechnung entsteht.
- Reservierungsfunktion `create_provisional_reservation` wird angepasst: kein Kunde, keine Teilnehmer mehr nötig; stattdessen `participant_count`. Preisberechnung, Lehrerzuteilung, Doppelbuchungsschutz und Sperre bleiben unverändert. Positionen werden weiterhin in korrekter Anzahl angelegt (Teilnehmerfeld bleibt vorerst leer), damit die Verfügbarkeitsprüfung den Slot sieht.
- Übergangsregel: schickt die alte Website noch Platzhalterdaten mit `reservierung+…@schneesportschule.li`, werden diese ignoriert statt gespeichert.
- Neue Funktion `finalize_provisional_reservation`: sperrt das Ticket, prüft Token, Ablaufzeit und Status, prüft dass die Teilnehmerzahl exakt zur Reservierung passt, findet oder erstellt den echten Kunden und die echten Teilnehmer nach den bestehenden Dublettenregeln, hängt sie an Ticket und Positionen, speichert Notizen — alles in einer Transaktion, ohne Termine, Zeiten, Lehrer oder Preis zu verändern. Bei Abweichung wird komplett abgebrochen.
- Einmaliges Aufräumen: die 4 bestehenden Platzhalter-Kunden und -Teilnehmer werden entfernt bzw. deren Tickets bereinigt (nur wenn keine bestätigte Buchung daran hängt).

## Änderungen an den Schnittstellen

**`create-reservation`**
- Neuer Vertrag: `product_id`, `participant_count` (1–20), `items`, optional `hold_minutes`/`notes`, `consent`.
- `customer`/`participants` optional (nur noch für Abwärtskompatibilität akzeptiert, Platzhalter werden verworfen).
- Antwort unverändert: `ticket_id`, `ticket_number`, `reservation_token`, `reservation_expires_at`, Zuteilungen, servergerechneter Preis.

**`confirm-booking`**
- Nimmt zusätzlich `customer`, `participants`, `notes` entgegen und ruft die neue Finalisierungsfunktion auf.
- Rechnung: finalisieren, Status `invoice_pending`, genau eine offene Rechnung.
- Onlinezahlung: ohne echte `payment_reference` → Validierungsfehler (400), Reservierung bleibt bestehen. Mit Referenz → Status `confirmed`, bezahlt, genau eine abgeschlossene Zahlung mit dieser Referenz.
- `payment_failed: true` → bleibt `payment_pending`, keine Zahlung.
- Preise, Zahlstatus und Quelle aus dem Browser werden weiterhin ignoriert.
- Wiederholter Aufruf liefert dasselbe Ergebnis ohne Doppelanlage (Kunde, Teilnehmer, Rechnung, Zahlung, Positionen).

## Admin-Oberfläche

Reservierungen ohne Kunde erscheinen in Buchungsliste, Buchungsdetail und Stundenplan als „Provisorisch (Website)" mit Personenzahl statt Kundenname — dafür werden nur die Anzeigestellen angepasst, die heute den Kundennamen erwarten.

## Tests

Ein Integrationsskript prüft direkt gegen die Endpunkte: anonyme Reservierung ohne Kundenanlage, Rechnungsbestätigung, Onlinezahlung mit und ohne Referenz, fehlgeschlagene Zahlung, falsche Teilnehmerzahl, abgelaufene Reservierung, doppelte Aufrufe, bestehender Kunde. Zusätzlich Kontrolle, dass nach den Tests keine Platzhalter-Datensätze existieren.

## Reihenfolge

1. Migration (Felder, Trigger, beide Datenbankfunktionen, Aufräumen).
2. Endpunkte aktualisieren und ausrollen.
3. Integrationstests gegen die Endpunkte laufen lassen.
4. Anzeige im Admin anpassen.
5. Vertrag an das Website-Team übergeben (Phase 2 dort umsetzen).
