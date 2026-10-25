# R1 Retest-Rollout – installierter Zustand (2026-10-25, 22:41–22:45 UTC)

Quelle: Commit 76a6ce1 (geprüft) plus die in diesem Lauf vom Migrationswerkzeug erzeugten Dateien 0030–0033.
Backend: Lovable Cloud (ein Backend für Vorschau und veröffentlichte App). **Core-Frontend nicht publiziert**
(Root publiziert nach Prüfung). Keine Onepager-Änderung, keine Buchungen/Rechnungen/Zahlungen/Mails/Resends.

## 1 Preflight (22:41:43 UTC, read-only)
Ledger 33 Einträge (0016–0029 unverändert vorhanden). Mit Root-Baseline 22:37:21 identisch:
tickets 1424 `7f203cd1a6d71acdfa7f5748884ee2f4`, invoices 19 `3394efc66b4e18d5afcf957b502258c4` (ohne content_snapshot),
payments 11 `1f0a0afa94e404cb9f03bef1f735e4fa`. Zusätzlich: ticket_items 1946 `befd534eb1312d892d2c27591760fc71`,
private_appointment_pricing 23 `d7c8503d22f590abd7fc68e0c71545ce`, booking_email_deliveries 2 `e9a1dd37c7087ac47ea4e07525bc066a`,
ticket_history 213 `aba3169e5852c768cfe0863694e06806`. Neuester Ticket-Eintrag 22:23:37 (T998142, fremde Aktivität, unberührt).

## 2 Migrationen (normales Migrationswerkzeug, Inhalt byteidentisch zu supabase/pending)
| Ledger-ID | Datei | Hash (Anfang) |
|---|---|---|
| 34 | 0030_r1_pa_move_keep_unassigned.sql | 894cc125ae08 |
| 35 | 0031_r1_group_created_total_event.sql | 38c1ed0a74aa |
| 36 | 0032_r1_invoice_content_snapshot.sql (gehärteter CHECK mit coalesce) | e3a6a02632b2 |
| 37 | 0033_public_private_tariff_projection.sql | f6d042abfede |
Ledger jetzt 37; Einträge 1–33 unverändert. Geprüft: CHECK `invoices_content_snapshot_shape` und Trigger
`trg_invoice_content_snapshot_immutable` vorhanden; Projektion und Triggerfunktion nicht für anon/authenticated
ausführbar; GROUP_BOOKING_CREATED in beiden Gruppen-Schreibern; assign_later in pa_move_appointment.

## 3 Tarifkorrektur 14–16 = 170 (supabase/pending/private_tariff_1416_170_correction.sql, ein DO-Block = eine Transaktion)
Ausgeführt ohne psql-Wrapper (BEGIN/COMMIT entfernt, sonst identisch). Revision beider Produkte 1 → 2, Akteur NULL,
Provenienz „Ivo 2026-10-25 DECISIONS Tarifkorrektur … installer run". Live: 75/75/75 Einzel, 190 (10–12), 150 (12–14),
170 (14–16), Ausnahmen 160, Büro 85, Zusatz 20/40. Rabatt unverändert Rev 1, 10 %, 240 Min., same_participant_same_day.
Neue Regel-IDs (alle neun ersetzt):
- Ski 3646f155…: 14–16 e8a37eb9-d662-4be1-8b71-4c83675b67d7 (vorher 45b0102a-…); 10–12 d6ebe0c1-…; 12–14 482a94e6-…;
  09–11 0a2e8866-…; 13–15 661812ef-…; hourly d76b2198-…, 73845d23-…, e36cfe11-…, dcfe9353-…
- Snowboard 0e8e8669…: 14–16 b4895923-6073-4cd7-8743-57ba264e2922 (vorher d6deec82-…); 10–12 e0ed6a30-…; 12–14 921aaf5f-…;
  09–11 a9cc7c91-…; 13–15 26c5774e-…; hourly 6e838fdd-…, ed51ee2e-…, 93cdcaad-…, eb7d15a7-…
Rollback: supabase/rollback/private_tariff_1416_170_correction_rollback.sql mit expected_revision=2.
Auf Revision 1 ausgestellte Quotes/Bestätigungen werden jetzt mit `quote_changed` abgelehnt (neu quoten).

## 4 Öffentliche Anzeige (public_private_prices_r1_display_update.sql)
Akteur d27b11a0-c8fc-46f6-a38b-edf2980221fc (ivo@ivo.ch, Rollen admin+super_admin, read-only bestätigt), verify=true,
psql-Variablen durch diese Werte ersetzt und source_note gemäss Auftrag: „Authorised by Ivo in YETI fix/price decisions
2026-10-25; executed by assistant via privileged installer, not UI; replaces display rev 1; prices from canonical resolver".
Kein UI-Klick. Beide Zeilen Rev 1 → 2, verified_at 22:43:49 UTC, sechs Fenster 75/75/75/190/150/170 + 20/20/20/40/40/40.
Projektion-Postflight im Installer erfolgreich. Rollback: supabase/rollback/public_private_prices_r1_display_update_rollback.sql.

## 5 Edge-Funktionen (deployt 22:44 UTC, Quell-SHA-256)
issue-invoice c3bd1d4a… · confirm-booking 96a16afd… · course-booking 28bcb30d… · retry-course-booking-delivery 5cdcd2e8… ·
send-invoice b7189f1b… · staff-booking-confirmation 658287ab… · private-appointments 6fae49a0… · office-booking e518a676… ·
get-website-products b7d7ccb4…  (volle Hashes im Deploy-Protokoll dieses Laufs).
Auth-Check ohne Anmeldung: alle acht Business-Funktionen POST → 401. get-website-products ohne x-api-key → 401 (erwartet).
Keine Rechnungs-/Mail-Aufrufe.

## 6 Postflight (22:45:03 UTC, read-only)
Alle Fingerprints aus 1 unverändert (tickets, invoices ohne Snapshot, payments, ticket_items, pricing, deliveries, history);
0 Rechnungen mit content_snapshot (alle 19 NULL). Kein neuer fremder Eintrag seit Baseline. 10 Website-Produkte der Saison.
Geschützte T998117/T998118/R-2026-00012 liegen in den unveränderten Fingerprints.

## Offen / nicht verifiziert
- Echter Katalog über den Onepager-Proxy: kein x-api-key im Assistenten-Kontext; HTTP-Prüfung der sechs Fenster,
  10 Produkte und online_bookable=false durch Root (Proxy-Cache bis 60 s).
- Core-Frontend-Publikation durch Root; bis dahin nutzt die veröffentlichte App den alten Client.
- Hotels bleiben zurückgestellt.
