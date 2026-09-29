# Security P0.2: Datenbank-Zugriff härten vor echten Buchungen

Nur Plan. Er stützt sich auf Live-Abfragen der Datenbank und auf den Code-Stand von heute. Es wurde nichts geändert.

## 1. Geprüfter Ist-Zustand

- Die Tabellenrechte für `anon` und `authenticated` sind auf allen public-Tabellen voll: SELECT, INSERT, UPDATE und DELETE. Nur die Policies begrenzen den Zugriff.
- **Policies, die anon direkt lesen lassen** (`TO anon USING true`): tickets, ticket_items, customer_participants, instructors, groups, conversations.
- **Policies `TO public` mit `true`, also offen für anon und für eingeloggte Nutzer ohne Rolle, zum Lesen und Schreiben:** payments, customer_contacts, master_bookings, group_courses, group_course_instances, group_course_schedules, group_course_enrollments, instructor_absences, shop_articles, shop_article_variants, private_lesson_rates (ALL).
- **Policies `TO public` zum Lesen und für einen Teil der Schreibrechte:**
  - booking_requests: SELECT true, INSERT true, UPDATE für jede eingeloggte Person
  - vouchers: SELECT, INSERT, UPDATE
  - voucher_redemptions: SELECT, INSERT
  - ticket_history: SELECT, INSERT
  - ticket_item_overrides: SELECT, UPDATE, DELETE
  - participant_level_history: SELECT, UPDATE
  - shop_transactions, shop_transaction_items, shop_stock_movements
  - nur lesend: office_shift_assignments, event_participants, events, event_categories, training_groups, training_course_dates, skill_levels, product_price_tiers
- **Volle CRUD-Rechte für jede eingeloggte Person, auch ohne Rolle:** customers, customer_participants, tickets, ticket_items, instructors, conversations, groups, products, trainings, training_participants, ticket_item_period_metadata, action_tasks, daily_task_templates, daily_task_completions, daily_reconciliations, ticket_number_counters. Lesen und Anlegen: ticket_comments. Nur lesen: billing_partners, capabilities, instructor_capabilities.
- **Bereits korrekt auf Büro/Admin begrenzt:** booking_cancellations, customer_credits, customer_credit_usage, ai_*, invoices, payment_profiles, refund_requests, user_roles, school_settings, pricing_rules.

### Datenbankfunktionen mit erhöhten Rechten (SECURITY DEFINER), für anon ausführbar und ohne Rollenprüfung
search_customers, merge_training_groups (2 Varianten), split_training_group, move_participant_to_group, generate_training_groups_for_week, duplicate_products_for_season, queue_confirmation_reminders, check_recurring_block_conflicts. Dazu kommen get_instructor_for_user und Trigger-Funktionen, die ebenfalls für anon ausführbar sind (update_credit_remaining, ensure_single_primary_contact, handle_*_notification).
- **Bereits korrekt gesperrt:** create_provisional_reservation, finalize_provisional_reservation, expire_reservations und generate_ticket_number laufen nur über die Service-Rolle.
- **Wer ruft sie auf:**
  - generate, split, merge und move für Gruppen: Kapazitätsplanung im Büro
  - search_customers: Kundensuche und Scheduler-Suche
  - check_recurring_block_conflicts: wiederkehrende Abwesenheiten
  - duplicate_products_for_season: Saisonverwaltung
  - queue_confirmation_reminders: kein Aufrufer im Frontend gefunden (vermutlich Cron, noch prüfen)

### Abhängigkeiten im Frontend
- **Öffentliches Buchungsportal `/book/*`:** Die Formulare lesen keine Tabellen direkt. Nur `RequestConfirmation` liest `booking_requests` direkt per Magic-Token, und das hängt allein an der Policy „SELECT true für alle“. Das ist der einzige öffentliche Pfad, der brechen würde.
- **Buchungsstatus:** Er läuft schon über die Edge Functions get-booking-status und confirm-booking (Token) und hängt an keiner Tabelle.
- **Lehrerportal (eingeloggt):** liest ticket_items, instructor_absences, instructors, instructor_capabilities und group_course_instances. Hooks wie useLivePlanningData, useGroupLeaderData, useUpdateAttendance, useUpdateParticipantLevel und useUpdateParticipantNotes lesen und schreiben customer_participants, customers, groups und training_participants. Diese Pfade brauchen „zugewiesen“-Policies, sonst brechen sie.
- **Büro-App:** Alle Büro- und Admin-Pfade laufen über `is_admin_or_office`, sie bleiben also funktionsfähig.

## 2. Ziel-Zugriffsmatrix

| Tabellengruppe | anon | eingeloggt ohne Rolle | teacher | office / admin | Service-Rolle |
|---|---|---|---|---|---|
| Kunden, Kontakte, Teilnehmende | – | – | lesen nur bei zugewiesenen Lektionen oder Gruppen (Name, Alter, Niveau, Notfallnotiz – offen, s. F2) | voll | voll |
| Buchungen (tickets, ticket_items, overrides, period_metadata, master_bookings, history, comments) | – | – | ticket_items lesen, wenn `instructor_id` = eigene ID; Bestätigungsfelder nur über die bestehende Edge Function | voll | voll |
| Zahlungen, Gutscheine, Rechnungen, Guthaben | – | – | – | voll | voll |
| Instructors | – (Website nur über get-public-instructors) | – | eigenes Profil lesen und begrenzt ändern; Kollegen nur Name und Foto? (F1) | voll | voll |
| Abwesenheiten, wiederkehrende Blöcke | – | – | nur eigene, CRUD | voll | voll |
| Gruppenkurse, Trainings, Gruppen, Einschreibungen | – | – | lesen und Anwesenheit/Niveau schreiben nur für zugewiesene Gruppen oder Instanzen | voll | voll |
| Conversations, Inbox, AI | – | – | – | voll | voll |
| Katalog (products, price_tiers, rates, skill_levels, seasons) | – (öffentlich über get-products und get-availability) | – | lesen | voll | voll |
| Shop, Inventar, Kasse, Tagesabschluss, Aufgaben | – | – | nur eigene Mieten (bestehend) | voll | voll |
| booking_requests | – (Magic-Token-Lesen über die neue Edge Function `get-booking-request`) | – | – | voll | voll |

Öffentliche Wege laufen nur über Edge Functions: get-products, get-availability, create-reservation, confirm-booking, get-booking-status, cancel-reservation, intake-booking, get-public-instructors und neu get-booking-request.

## 3. Gestufter Plan (3 unabhängig deploybare Schritte)

### Schritt 1: Öffentliche Pfade umstellen und Funktionen sperren (vollständig additiv beziehungsweise verengend, ohne UI-Bruch)
- Neue Edge Function `get-booking-request` (anon). Die Magic-Token-Suche gibt nur die Felder zurück, die RequestConfirmation anzeigt.
- Frontend: RequestConfirmation nutzt diese Funktion statt der direkten Tabellenabfrage.
- Migration A, nur Funktionen:
  - `REVOKE EXECUTE … FROM anon, public` für alle Funktionen mit erhöhten Rechten.
  - Die 8 ungeschützten Funktionen bekommen am Anfang `IF NOT is_admin_or_office(auth.uid()) THEN RAISE`. Ausnahme: check_recurring_block_conflicts erlaubt auch den Lehrer selbst.
  - queue_confirmation_reminders nur für service_role.
  - Trigger-Funktionen: EXECUTE für anon und authenticated entziehen (Trigger laufen weiter).
- Rollback: Die Rechte lassen sich mit GRANT wieder vergeben, die alten Funktionskörper liegen in der Migration bei.

### Schritt 2: anon-Zugriff entfernen (Migration B)
- Alle Policies löschen, die `TO anon` gelten oder `TO public` mit `true` beziehungsweise `auth.role()='authenticated'` gelten. Ersatz: `TO authenticated USING is_admin_or_office(auth.uid())`.
- `REVOKE ALL ON <Business-Tabellen> FROM anon`. Nur echte Katalogtabellen, falls überhaupt, behalten SELECT.
- Voraussetzung: Schritt 1 ist live und die Buchungsseite läuft über die Edge Function.
- Rollback: Die Migration enthält ein fertiges Rückweg-Skript mit den alten Policies. Kein Schema- und kein Datenverlust.

### Schritt 3: Eingeloggte Nutzer auf Rollen begrenzen (Migration C)
- Alle Policies „authenticated true“ ersetzen: für office und admin durch `is_admin_or_office`, für teacher durch Policies auf zugewiesene Daten.
- Neue Hilfsfunktionen, stabil und mit SECURITY DEFINER: `teacher_assigned_ticket_item(id)`, `teacher_assigned_participant(id)`, `teacher_assigned_group(id)`. Grundlage sind `get_instructor_for_user(auth.uid())` und die Zuweisungen in ticket_items, groups und group_course_instances.
- Vorher müssen die Lehrerportal-Hooks gegen die neuen Policies getestet sein. Wo ein Hook Kundendaten braucht, die ein Lehrer nicht sehen soll, wird er auf eine schmale Abfrage umgestellt, das heißt nur die nötigen Spalten.
- Rollback: wie in Schritt 2.

## 4. Tests pro Schritt
Die Tests laufen mit echten Sessions für anon, einen Nutzer ohne Rolle, einen Lehrer, das Büro und einen Admin, dazu der Security-Linter.
- Anon: jede Business-Tabelle liefert 0 Zeilen oder einen Fehler, jede RPC mit erhöhten Rechten wird abgelehnt.
- Die öffentliche Buchung funktioniert Ende-zu-Ende: Reservierung, Bestätigung, Status und Request-Seite.
- Lehrer: das eigene Lehrerportal läuft, der Zugriff auf eine fremde Lektion wird abgelehnt.
- Büro: Scheduler, Buchung, Kapazitätsplanung, Kundensuche und Saison-Duplizieren funktionieren.

### Testmatrix (Soll-Ergebnis nach Schritt 3)

| Akteur | Business-Tabellen | RPCs mit erhöhten Rechten | Öffentliche Edge Functions | Lehrerportal |
|---|---|---|---|---|
| Anonym, ohne Schlüssel | abgelehnt | abgelehnt | nur mit Website-Key oder Token | – |
| Öffentlicher App-Key | 0 Zeilen oder abgelehnt | abgelehnt | wie oben, App-Key allein reicht nicht | – |
| Eingeloggt ohne Rolle | 0 Zeilen oder abgelehnt | abgelehnt | wie anon | – |
| Lehrer A, eigene Daten | nur zugewiesene Zeilen | nur check_recurring_block_conflicts für sich selbst | wie anon | funktioniert |
| Lehrer A, Daten von Lehrer B | 0 Zeilen, Schreiben abgelehnt | abgelehnt | – | – |
| Office | voll | erlaubt | – | – |
| Admin | voll | erlaubt | – | – |
| Service-Rolle (nur Server) | voll | erlaubt, auch queue_confirmation_reminders | – | – |

## 5. Offene Produktentscheidungen
- **F1:** Soll ein Lehrer im Portal Kollegen sehen, z. B. bei Transfers und Live-Planung? Wenn ja, nur Name und Foto.
- **F2:** Welche Teilnehmerfelder braucht ein Lehrer: Notfallkontakt, Telefon der Eltern, Allergien?
- **F3:** Ist die offene Registrierung aktiv? Wenn ja, ist Schritt 3 genauso dringend wie Schritt 2.
- **F4:** Bleiben Katalogtabellen (products, skill_levels, events) für anon direkt lesbar, oder läuft das nur noch über Edge Functions? Empfehlung: nur über Edge Functions.
- **F5:** Wer startet queue_confirmation_reminders, ein Cron-Job oder nichts?

## Technische Details
- Die Migrationen verändern nur Policies, Grants und Funktionskörper. Es gibt kein DROP TABLE und kein DROP COLUMN.
- Jede Migration hat eine gleichnamige Rollback-Datei.
- Die Reihenfolge 1 → 2 → 3 ist Pflicht. Jeder Schritt ist für sich allein lauffähig, und der vorherige App-Code bleibt mit jedem Zwischenstand kompatibel. Ausnahme: RequestConfirmation braucht nach Schritt 2 den neuen Code.
