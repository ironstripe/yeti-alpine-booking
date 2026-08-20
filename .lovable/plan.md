# Bugfix Sprint: Navigation & Dashboard-Zähler

Alle vier Punkte wurden im laufenden System reproduziert bzw. gegen die Datenbank geprüft. Ergebnis: drei echte Bugs, ein Zähler ist bereits korrekt.

## 1. Buchungs-Detailseite stürzt ab (betrifft Task 2 und Task 3)

Bestätigt: Klick auf "Offene Buchungen" im Dashboard führt korrekt zu `/bookings/<id>`, aber die Seite zeigt "Etwas ist schiefgelaufen".

Ursache (reproduziert): `BookingDetail` übergibt an den Stornierungs-Dialog `start_date: ticket.items[0]?.date || ''`. Bei Buchungen ohne Positionen ist das ein leerer String, und die Datumsformatierung wirft `RangeError: Invalid time value` — die ganze Seite crasht. In der Datenbank gibt es aktuell **43 Buchungen ohne Positionen** (u. a. YETY-2026-00989, die oben im Dashboard steht).

Da die Kundenhistorie auf dieselbe Route verlinkt, ist Task 3 derselbe Fehler — kein zweiter Bug.

Fix:
- Datumsangaben im Stornierungs-Dialog defensiv behandeln (nur formatieren, wenn ein gültiges Datum vorliegt, sonst Platzhalter "Kein Datum").
- Gleiche Absicherung in `calculateCancellation`, damit die Fristberechnung ohne Datum nicht kippt.
- Stornieren-Button deaktivieren, wenn die Buchung keine terminierten Positionen hat.

Zusätzlich (kleiner Folgefehler auf derselben Seite): Die E-Mail-Verlauf-Abfrage liefert HTTP 400 (`metadata->ticket_id` statt `metadata->>ticket_id`), der Verlauf bleibt dadurch immer leer.

## 2. Zähler "Zahlungen ausstehend" zeigt 0

Bestätigt im Dashboard: "Zahlungen ausstehend: 0", obwohl **97 Buchungen** einen offenen Betrag haben.

Ursache: Die Abfrage in `ActionRequiredBox` enthält den Platzhalter-Vergleich `.lt("paid_amount", supabase.rpc ? 0 : 0)` — sie fragt also "bezahlt < 0" ab und liefert immer 0.

Fix: Offene Buchungen korrekt ermitteln (Gesamtbetrag > 0, bezahlt < Gesamtbetrag, nicht storniert) und den Zähler daraus bilden. Klickziel bleibt die gefilterte Buchungsliste.

## 3. Zähler "Überfällig (>24h)"

Geprüft: Der Posteingang zeigt 809, die Datenbank liefert exakt 809 ungelesene Eingänge älter als 24 Stunden. Dieser Zähler ist korrekt — hier ist keine Änderung nötig.

Ebenfalls aufgefallen (nicht Teil der Aufgabe, auf Wunsch mit erledigt): "Lehrer nicht zugewiesen" zählt 114 Positionen ohne jede Zeit- oder Ticketprüfung, also auch vergangene und stornierte Buchungen.

## 4. Passwort-Reset-Schleife

Die Reset-Seite verlässt sich vollständig auf die automatische Token-Erkennung des Auth-Clients. Kommt der Nutzer über den E-Mail-Link (Tokens im URL-Fragment) an, ist die Sitzung beim ersten Rendern noch nicht gesetzt, und die Seite zeigt "Link ungültig" bzw. leitet zur Anmeldung.

Fix: Dieselbe Mechanik wie bei der bereits funktionierenden Einladungsseite verwenden — Tokens aus dem URL-Fragment manuell auslesen, die Sitzung explizit setzen, während der Prüfung einen Ladezustand zeigen und erst danach entscheiden, ob das Formular oder die Fehlermeldung erscheint. Zusätzlich den PKCE-Code-Parameter (`?code=`) behandeln, falls der Link diese Form hat.

## Technische Details

- `src/components/bookings/CancellationDialog.tsx`: Datumsformatierung absichern.
- `src/lib/cancellation-utils.ts`: ungültige/leere Startdaten abfangen.
- `src/pages/BookingDetail.tsx`: Stornieren nur bei terminierten Positionen; `email_logs`-Filter auf `metadata->>ticket_id` korrigieren.
- `src/components/dashboard/ActionRequiredBox.tsx`: Zahlungs-Zähler neu berechnen, Zuweisungs-Zähler auf aktive/zukünftige Positionen einschränken.
- `src/pages/ResetPassword.tsx`: explizites Setzen der Recovery-Sitzung aus URL-Fragment bzw. Code, analog `SetPassword.tsx`.

Keine Datenbank-Änderungen nötig.
