# Retest R1 – Verifikation (lokal, nicht installiert)

Stand: 2026-10-25, Basis c6eaef5. **Nichts gehostet installiert, deployt, publiziert oder versendet.** Keine
Hotel-, Tarif-, Rechnungs-, Zahlungs- oder Historienänderung. Alle Tests: private lokale PostgreSQL 17 (+ PostgREST 14)
aus `tests/sql/production_schema_baseline.sql` mit synthetischen Fixtures, fake Transport.

## Die sechs Punkte

| # | Befund | Ursache | Änderung | Tests |
|---|---|---|---|---|
| S1 | R00013–16: „Teilnehmer - Privatunterricht Ski" ohne Namen/Datum/Zeit | Rechnungsdarstellung baute Zeilen aus aktuellen `ticket_items`-Labels; keine Versionsgrenze | Neue Spalte `invoices.content_snapshot` (v1), beim Ausstellen (draft→open) **einmal** aus `bookingReadProjection` eingefroren: eine Geldzeile pro Abrechnungszeile/Lektion, mehrere Personen in einer Zeile ohne Vervielfachung. Office-Vorschau/Druck, HTML/PDF/Versand lesen denselben Snapshot. NULL = Altrechnung → exakt bisherige Darstellung, kein Backfill. Unvollständige Beziehungen ⇒ keine Ausstellung (`CONTENT_FAILED`, Entwurf gelöscht). Trigger verbietet Ändern/Entfernen und Nachtragen auf bereits ausgestellte Rechnungen | `_shared/invoiceContent.test.ts` 5/5 (2 Personen/1 Lektion, Mehrtag+Gruppe+Mittag, fail-closed, Legacy=null, PDF-Text via pdftotext, spätere Änderung zeichnet nicht neu); SQL-Trigger-Check (Ausstellen ok; Ändern/NULL/Legacy-Nachtrag/falsche Form abgelehnt; Statuswechsel ok); `invoice-service.test` + `invoiceStep` + `invoicePdf` 19/19; B06 Versand 10/10 einzeln und auf Gesamtkette; B04 19/19 Gesamtkette |
| S2a | T998122 Notiz-Edit mit „Später zuweisen" ⇒ „Bitte eine Lehrperson wählen" | `TicketItemEditCard` sendet alle Felder; `useUpdateTicketItem` wertete das als Verschiebung, SQL `pa_move_appointment` lehnt NULL ab | `planCanonicalMove`: reine Notiz/No-op ⇒ kein Move; NULL→NULL-Terminänderung nur mit explizitem `assign_later`; zugewiesen→NULL weiterhin abgelehnt. SQL akzeptiert NULL nur bei `assign_later=true` **und** bereits unzugewiesener Lektion; Quote/Ack, Locks, Stale-Editor, geschützte Rechnung unverändert | `r1PaMoveUnassigned.integration.mjs` 8/8; `r1Retest.test.ts` (Plan) |
| S2b | Tastatureingabe morgen/2030 erreicht „Erstellen", negatives Alter | Inline-Felder (`SlotBookingPopover`, `ParticipantListCard`) und Schlussprüfung `Step4Summary` ohne B08-Regel | Bestehender Helfer `birthDateChangeError` (Schultag Europe/Zurich) an den drei Stellen, Feldfehler + gesperrtes Erstellen; heute gültig, unveränderte historische Werte/NULL nicht neu beurteilt | `r1Retest.test.ts`, `birthDate.test.ts` |
| S2c | Schritt 1 zeigt 170 statt 190 (10–12/14–16) | `BookingSummaryCards` renderte Client-`PriceBreakdown` (Altsätze) | Bei aktiven Tarifen `StepOnePrivateServerQuote` = gleicher Server-Quote wie Schritt 4 (`paCreateQuote`), Laden/„nicht verfügbar" statt Altpreis; finale Quote unverändert massgebend | Typecheck; vorhandene B07b-Wizardtests unverändert. **Nicht** separat im Browser nachgetestet |
| S2d | T998124/T998131: kein finaler Gruppen-Buchungsbetrag | Gruppenschreiber protokollierte nur Anlage mit 0 | `GROUP_BOOKING_CREATED` mit `ticket_total_after_create` im kanonischen Gruppenschreiber; B07a-Mehrfachkorb: nur bei reinem Gruppenkorb einmal am Ende (kein Zwischen-Subtotal), Korb mit Privat behält B11-Ereignis; Replay schreibt nichts; keine Historienänderung | `r1GroupCreatedEvent.integration.mjs` 5/5; Rollback reproduziert Funktionen exakt |
| S3 | Reine Zuweisung erzeugt „Privatlektion verschoben" mit gleichen Zeiten | Label nur nach `change="moved"` | `movedDiff` vergleicht den eigenen Payload: Zuweisung/Wechsel/Entfernung bzw. „gespeichert (ohne …)"; echte Verschiebung bleibt; unbekannte Altform zeigt Gespeichertes; Rohhistorie unverändert | `r1Retest.test.ts` (5 Fälle), `ticketHistoryFormat.test.ts` |

## Gestaffelte SQL (supabase/pending, nach 0016–0029, in dieser Reihenfolge)
1. `r1_pa_move_keep_unassigned.sql` (Rollback `supabase/rollback/r1_pa_move_keep_unassigned_rollback.sql` = exakte 0025-Funktion)
2. `r1_group_created_total_event.sql` (Rollback = Funktionskörper vor dem Patch, lokal per `diff` bestätigt)
3. `r1_invoice_content_snapshot.sql` (Rollback `supabase/rollback/r1_invoice_content_snapshot_rollback.sql`; Spalte bleibt, als deprecated markiert)

`tests/combinedChain.ts` hängt diese drei als `R1_PENDING` an das Kettenende. Promotion zu getrackten Migrationen ist
noch offen (Verzeichnis im Sandbox schreibgeschützt; über das Migrationswerkzeug einspielen).

**Reihenfolge zwingend: SQL vor Edge.** Neue `issueInvoice` schreibt `content_snapshot`; ohne Spalte schlägt jede
Ausstellung fail-closed fehl (lokal reproduziert: `Could not find the 'content_snapshot' column`).

## Edge-Deploy-Closure (aus Imports abgeleitet)
- `invoice-service.ts` → `issue-invoice`, `confirm-booking`, `course-booking`
- `courseDelivery.ts` (liest Snapshot) → `course-booking`, `retry-course-booking-delivery`, `send-invoice`, `staff-booking-confirmation`
- `privateAppointmentsContract.ts` → `private-appointments`, `office-booking` (via `officeBookingContract`)

Total 7 Funktionen. `retry-booking-confirmation`, `staff-group-booking`, `get-products`, Tarif-Endpunkte: keine geänderte Abhängigkeit.
Frontend-Dateien: BookingDetail, BookingSummaryCards, StepOnePrivateServerQuote, SlotBookingPopover, ParticipantListCard,
Step4Summary, useUpdateTicketItem, useTicketHistory, useInvoices, ticketHistoryFormat, ticketItemEditPlan,
privateAppointmentsApi, invoiceContent (re-export).

## Bekannte Grenzen
- `tests/courseBookingApi.integration.ts`: 14/20; die 6 Fehler betreffen Versandschema/-erwartungen (Suite installiert B04 0016 nicht, erwartet ältere Anhänge) – nicht R1, bereits vor R1 veraltet; R1-SQL wurde der Suite hinzugefügt.
- S2c nicht im Browser nachgeprüft; kein Test gegen gehostetes Backend.

## Onepager: warum keine Privatpreise (nur Diagnose, nichts geändert)
Gehostet, read-only geprüft:
1. Funktion `public_private_tariff_projection` **fehlt** (0 Treffer) – sie war bewusst nicht Teil von 0016–0029.
2. Die gehostete `get-website-products` ist eine **ältere Version** als das Repo (anonymer Aufruf: 401 `Unauthorized`; Repo-Version ruft die Projektion auf). Die Projektionsversion ist nicht deployt.
3. `public_private_tariff_display` hat 2 verifizierte Zeilen (beide 26/27-Produkte, Rev. 1), aber mit 11 Fenstern inkl. **09–11/11–13/13–15 = 160 als `standard`** sowie gespeicherten Beträgen. Laut DECISIONS sind 09–11/13–15 Ausnahmen (160) und öffentlich gelten nur sechs Standardfenster (09–10/12–13/13–14 je 75; 10–12 190, 12–14 150, 14–16 190). Diese Metadaten müssen vor der Freigabe auf die sechs Fenster korrigiert werden; 11–13 ist in keiner Entscheidung erwähnt.
4. Die 170 bei 14–16 im Screenshot stammt nicht aus diesen Daten (dort 190), sondern aus der alten Onepager-Darstellung/Alt-`private_rates`; DECISIONS 190 bleibt.

Minimal fehlend für Privatpreise: (a) Projektion-SQL installieren, (b) Fenster-Metadaten auf die sechs Standardfenster
korrigieren und neu verifizieren, (c) Repo-`get-website-products` deployen, (d) Onepager liest die Projektion. Keine Preisänderung nötig.
