# P0.2 Schritt 2A: Direkten Zugriff mit dem öffentlichen Schlüssel entfernen

## Wichtig: Diese Migration ist schon live
Nach deiner Freigabe des letzten Plans habe ich sie heute um 21:42 UTC angewendet (Migration `20260929214202_…sql`). Dieses Dokument beschreibt deshalb die angewendete Änderung, die Tests, die noch fehlen, und den Rückweg. Es schlägt keine neue Migration vor.

Live geprüft: 0 Policies mit `anon` oder `public` und 0 Tabellenrechte für `anon` oder `PUBLIC` auf allen 81 public-Tabellen.

## Katalogdaten und Business-Daten
- **Echter öffentlicher Katalog:** products, product_price_tiers, private_lesson_rates, skill_levels, seasons und die öffentlichen Lehrerprofile. Die Website bekommt diese Daten nur über get-products, get-availability und get-public-instructors. Alle drei lesen mit dem Server-Schlüssel und verlangen den Website-Schlüssel. Für diese Tabellen braucht es deshalb keinen direkten anon-Zugriff (F4 entschieden: sperren).
- **Business-Daten:** alle übrigen Tabellen. Die öffentliche Anfrage läuft über submit-booking-request und get-booking-request, Reservierung und Status über create-reservation, confirm-booking, get-booking-status, cancel-reservation und intake-booking. Alle diese Funktionen nutzen den Server-Schlüssel, der Rechte und Policies umgeht.

## Betroffene Policies (123) nach Art

**Nur anon, gelöscht (6):** conversations, customer_participants, groups, instructors, ticket_items, tickets (je eine SELECT-Policy mit `true`)

**`TO public` mit `true`, jetzt `TO authenticated` mit unveränderter Bedingung:** booking_requests, customer_contacts, group_course_enrollments, group_course_instances, group_course_schedules, group_courses, instructor_absences, master_bookings, payments, private_lesson_rates, product_price_tiers, shop_article_variants, shop_articles, shop_stock_movements, shop_transaction_items, shop_transactions, skill_levels, ticket_history, voucher_redemptions, vouchers

**`TO public` mit `auth.role()='authenticated'`, jetzt `TO authenticated`, Bedingung unverändert:** booking_requests, event_categories, event_participants, events, office_shift_assignments, participant_level_history, private_lesson_rates, ticket_item_overrides, training_course_dates, training_groups

**`TO public` mit Rollenbedingung (is_admin_or_office, has_role, eigene Lehrperson), jetzt `TO authenticated`, Bedingung unverändert:** ai_configuration, ai_knowledge_documents, booking_cancellations, customer_credit_usage, customer_credits, email_logs, email_templates, event_categories, event_participants, events, instructor_notification_queue, instructor_recurring_blocks, invoices, notification_preferences, notifications, office_hour_blocks, office_shift_assignments, participant_transfer_requests, product_price_tiers, refund_requests, skill_levels, training_course_dates, training_groups

Für angemeldete Nutzer bleibt die Wirkung gleich: Eine Policy für `public` galt schon für `authenticated`, und keine Bedingung wurde verändert. Policies, die bereits nur für `authenticated` galten, wurden nicht angefasst.

## Grants
- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`
- `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon`
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES / SEQUENCES FROM anon`
- Die Rechte für authenticated und service_role bleiben unverändert. Die Funktionsrechte waren schon in Schritt 1B geregelt.

## Rückweg
`supabase/rollback/p02_step2a_rollback.sql` liegt ausserhalb der Migrationen. Es stellt alle 123 Policies in ihrer ursprünglichen Form wieder her, als Abzug direkt vor der Migration, und vergibt die anon-Tabellen- und Sequenzrechte samt Default Privileges neu. Es läuft in einer Transaktion und verändert weder Schema noch Daten.

## Tests
Bereits gelaufen:
- Mit dem öffentlichen Schlüssel liefern 13 Tabellen 401, darunter customers, tickets, instructors, payments, booking_requests, products und invoices. Direktes INSERT in booking_requests gibt 401.
- get-booking-request mit falschem Token gibt 404.
- get-products und get-public-instructors ohne Website-Schlüssel geben 401.

Noch offen:
1. Auf der öffentlichen Seite im Browser eine neue Anfrage absenden, ohne Anmeldung, dann den Link öffnen und die Anzeige prüfen. Danach die Testanfrage löschen.
2. get-products, get-availability und get-public-instructors mit dem Website-Schlüssel aufrufen: Die Daten müssen unverändert zurückkommen.
3. Reservierung Ende-zu-Ende: create-reservation, confirm-booking, get-booking-status, cancel-reservation.
4. Lehrer-Konto (Ivo): Stundenplan, Abwesenheiten, Live-Planung und Gruppen laden ohne Fehler.
5. Büro-Konto (Christoph): Scheduler, Buchungsdetail, Kunden, Inbox und Gruppenplanung laden ohne Fehler.
6. Den Sicherheitscheck erneut laufen lassen und bestätigen, dass keine neue Meldung dazugekommen ist.

## Blocker
- Für Test 4 und 5 fehlen echte Browser-Sessions. Ich kann sie über die Sitzungsfreigabe erzeugen, dafür brauche ich pro Konto deine Zustimmung.
- Test 3 legt echte Reservierungen an. Sie müssen danach gelöscht werden.
- Die Bestätigungs-E-Mail zur Anfrage wird weiterhin nicht versendet, weil die Absender-Domain beim E-Mail-Dienst noch nicht bestätigt ist. Das ist unabhängig von 2A.
- Angemeldete Nutzer ohne Rolle sehen weiterhin alles. Das bleibt bewusst Schritt 3. Registrierung ist laut deiner Antwort nicht offen (F3). Das habe ich in den Auth-Einstellungen nicht geprüft.
