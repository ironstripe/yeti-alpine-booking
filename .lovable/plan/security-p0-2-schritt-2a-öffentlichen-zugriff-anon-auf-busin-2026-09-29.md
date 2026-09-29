# Security P0.2 Schritt 2A: Öffentlichen Zugriff (anon) auf Business-Daten schliessen

Nur Plan. Nichts wird geändert, bis du freigibst.

## Ziel
Der öffentliche App-Schlüssel darf keine Kunden-, Teilnehmer-, Buchungs-, Lehrer-, Zahlungs-, Konversations- oder Planungsdaten mehr lesen oder schreiben. Für eingeloggte Nutzer ändert sich in 2A **nichts** (das ist Schritt 3). So bleibt Büro und Lehrerportal sicher lauffähig.

## Geprüfter Ist-Zustand (heute abgefragt)
- Policies nur für anon mit `true`: conversations, customer_participants, groups (dazu laut Plan tickets, ticket_items, instructors).
- Policies `TO public` mit `true`, damit auch für anon offen: booking_requests (INSERT, SELECT), customer_contacts, group_courses, group_course_instances, group_course_schedules, group_course_enrollments, instructor_absences und weitere aus der Liste im P0.2-Plan (payments, master_bookings, shop_*, vouchers, ticket_history, overrides, private_lesson_rates ...).
- Policies `TO public` mit `auth.role()='authenticated'`: schützen schon, sind aber unsauber (events, event_*, booking_requests UPDATE).
- Frontend: Kein Code in `src` liest `booking_requests` mehr direkt; die Buchungsseiten laufen über `submit-booking-request` und `get-booking-request`.

## Vorgehen

### 1. Vorprüfung (read-only, vor der Migration)
- Vollständige Liste aller Policies erzeugen, die anon erreichen (`anon` oder `public` in roles).
- Öffentliche Seiten `/book`, `/book/private`, `/book/group`, `/book/request/:token`, Login, Passwort setzen/zurücksetzen und `/confirm`-Links mit Playwright ohne Anmeldung durchklicken und alle direkten Tabellenzugriffe im Netzwerk mitschreiben. Erwartung: null. Jeder Fund blockiert 2A, bis er auf eine Edge Function umgestellt ist.
- Prüfen, ob Edge Functions mit dem Anon-Key statt Service-Rolle auf Tabellen zugreifen (dann würden sie brechen).

### 2. Migration 2A (eine Datei, additiv/verengend)
Für jede betroffene Policy:
- `TO anon ... true` → löschen (eingeloggte Nutzer haben schon eigene Policies).
- `TO public ... true` → löschen und **gleichlautend** neu als `TO authenticated` anlegen. Eingeloggte Nutzer behalten also genau ihren heutigen Zugriff.
- `TO public ... auth.role()='authenticated'` → neu als `TO authenticated USING (true)`, gleiche Wirkung, sauberer.
- booking_requests: öffentliche INSERT- und SELECT-Policy entfernen; nur noch Service-Rolle (Edge Functions) und angemeldete Nutzer wie heute.
- Danach `REVOKE ALL ON <alle public-Tabellen> FROM anon` als zweite Sperre. Offen: Katalogtabellen (siehe F4), Empfehlung: auch sperren, die Website nutzt get-products/get-availability.
- `ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM anon`, damit neue Tabellen nicht wieder offen sind.
- Rollback-Datei mit allen alten Policies und Grants wird mitgeliefert.

### 3. Tests nach der Migration
- Anon-Key: jede public-Tabelle liefert Fehler oder 0 Zeilen, Schreiben scheitert.
- Öffentliche Anfrage Ende-zu-Ende: absenden, Link öffnen, Anzeige korrekt.
- Website-Funktionen: get-products, get-availability, create-reservation, confirm-booking, get-booking-status, cancel-reservation, get-public-instructors antworten wie vorher.
- Lehrer-Konto: Portal (Stundenplan, Abwesenheiten, Live-Planung, Gruppen) funktioniert unverändert.
- Büro-Konto: Scheduler, Buchungen, Kunden, Inbox, Gruppenplanung funktionieren.
- Security-Linter erneut laufen lassen.

## Nicht in 2A
- Eingeloggte Nutzer ohne Rolle sehen weiterhin alles, was sie heute sehen. Das schliesst Schritt 3. Wenn die offene Registrierung aktiv ist (F3), ist das das nächste Risiko.
- Keine Schema-, Funktions- oder Frontend-Änderung.

## Entscheidungen vor Umsetzung
- **F3:** Ist Selbst-Registrierung erlaubt? Wenn ja, Schritt 3 direkt danach.
- **F4:** Katalogtabellen für anon auch sperren? Empfehlung: ja.
- **Testanfrage ANF-2026-00001** löschen? (von Schritt 1D)

## Technische Details
- Nur `DROP POLICY` / `CREATE POLICY` / `REVOKE`; kein DROP TABLE/COLUMN.
- Service-Rolle umgeht RLS, Edge Functions sind nicht betroffen, solange sie den Service-Key nutzen (Vorprüfung bestätigt das).
- Alter App-Code bleibt kompatibel, da kein öffentlicher Pfad mehr direkt Tabellen nutzt.
