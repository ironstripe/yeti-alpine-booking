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

## Edge-Deploy-Closure (transitiv aus Imports neu berechnet, Review-Korrektur)
Geänderte Server-Module: `_shared/invoice-service.ts`, `_shared/invoiceContent.ts`, `_shared/invoiceContentLoad.ts`,
`_shared/courseDelivery.ts`, `_shared/privateAppointmentsContract.ts`, `private-appointments/index.ts`.
**Acht** Funktionen (vorher fälschlich „7"):
`issue-invoice`, `confirm-booking`, `course-booking`, `retry-course-booking-delivery`, `send-invoice`,
`staff-booking-confirmation`, `private-appointments`, `office-booking`.
Separat (öffentliches Preis-Paket, nicht R1): `get-website-products` – siehe `docs/public-private-prices-r1-release.md`.

## Kombiniertes Migrationspaket (Reihenfolge, SQL vor Edge)
0016–0029 (installiert) → 0030 `r1_pa_move_keep_unassigned.sql` → 0031 `r1_group_created_total_event.sql` →
0032 `r1_invoice_content_snapshot.sql` → 0033 `public_private_tariff_projection.sql` (öffentliches Paket) →
Datenschritt `public_private_prices_r1_display_update.sql` (nicht Migration; Akteur-Voraussetzung dort).
Quellen liegen in `supabase/pending/`; Promotion zu getrackten Dateien über das Migrationswerkzeug.

## Review-Korrekturen (Basis 5d0bd196, Arbeitsstand HEAD 0410551 + diese Änderungen)
- **Vollständigkeit (S1):** `buildInvoiceContentV1` verweigert jetzt (`invoice_content_incomplete`) bei fehlendem
  Termin, fehlender Teilnehmerverknüpfung, fehlender Teilnehmerzeile, fehlender Zeile einer **zugewiesenen**
  Lehrperson; `instructor_id NULL` (Später zuweisen) bleibt gültig ohne Lehrpersonangabe. Test 6/6
  (`_shared/invoiceContent.test.ts`).
- **CHECK (S1):** dreiwertige Logik geschlossen: nicht-NULL Snapshot muss Objekt, `version` = Zahl 1 und
  `lines` Array sein; `{}`, `{"version":1}`, `{"lines":[]}`, `"1"`, `lines:{}`, `[]`, Skalar, v2 abgelehnt
  (`tests/sql/r1_invoice_content_snapshot_check.sql`, lokal grün).
- **courseBookingApi:** Suite installiert jetzt Baseline + Kurs-SQL + 0000–0027 + R1-Pending (falls vorhanden).
  Vergleich mit Pre-R1-Checkout c6eaef5 (gleiches Setup, fake Transport): **beide 15/20, identische
  Ergebnisliste** (`diff` leer) → keine neuen Fehler durch R1. Die 5 gemeinsamen Fehler (full flow, provider
  rejection, missing QR, network unknown, delivery unknown outcomes) sind Erwartungsdrift der Suite, nicht R1.
- **Schritt-1-Preis (S2c):** `tests/r1StepOneQuote.test.tsx` 5/5 – echte Komponenten, Server-190 bei 14–16,
  kein 170; beim (Neu-)Laden kein alter Preis; Zeit/Datum/Personen/Produkt ändern den Request-Schlüssel (alte
  Antwort nicht wiederverwendbar); Fehler/fehlendes Produkt ehrlich ohne Betrag; ohne Personen kein Request.
  Kein Browserlauf, keine Buchung/Nachricht.

## Bestandsschutz nach Installation (read-only zu prüfen)
Vorher: 19 Rechnungen, 1423 Tickets, 11 Zahlungen. Neue Spalte verändert einen Voll-JSON-Fingerabdruck; daher
vor/nach vergleichen **ohne** `content_snapshot`:
`SELECT count(*), md5(string_agg((to_jsonb(i) - 'content_snapshot')::text, ',' ORDER BY id)) FROM invoices i;`
plus `SELECT count(*) FROM invoices WHERE content_snapshot IS NOT NULL` = 0 für alle 19 bestehenden Rechnungen;
Tickets/Zahlungen-Fingerabdrücke unverändert.

## Onepager: warum keine Privatpreise (nur Diagnose, nichts geändert)
Gehostet, read-only geprüft:
1. Funktion `public_private_tariff_projection` **fehlt** (0 Treffer) – sie war bewusst nicht Teil von 0016–0029.
2. Die gehostete `get-website-products` ist eine **ältere Version** als das Repo (anonymer Aufruf: 401 `Unauthorized`; Repo-Version ruft die Projektion auf). Die Projektionsversion ist nicht deployt.
3. `public_private_tariff_display` hat 2 verifizierte Zeilen (beide 26/27-Produkte, Rev. 1), aber mit 11 Fenstern inkl. **09–11/11–13/13–15 = 160 als `standard`** sowie gespeicherten Beträgen. Laut DECISIONS sind 09–11/13–15 Ausnahmen (160) und öffentlich gelten nur sechs Standardfenster (09–10/12–13/13–14 je 75; 10–12 190, 12–14 150, 14–16 190). Diese Metadaten müssen vor der Freigabe auf die sechs Fenster korrigiert werden; 11–13 ist in keiner Entscheidung erwähnt.
4. Die 170 bei 14–16 im Screenshot stammt nicht aus diesen Daten (dort 190), sondern aus der alten Onepager-Darstellung/Alt-`private_rates`; DECISIONS 190 bleibt.

Minimal fehlend für Privatpreise: (a) Projektion-SQL installieren, (b) Fenster-Metadaten auf die sechs Standardfenster
korrigieren und neu verifizieren, (c) Repo-`get-website-products` deployen, (d) Onepager liest die Projektion. Keine Preisänderung nötig.
