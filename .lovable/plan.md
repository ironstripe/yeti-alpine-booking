# B+ Phase 1 (Option A): Website-Buchungen auf Rechnung sofort verbindlich

## Ziel
Wählt der Gast auf der Website `payment_method = "invoice"` und schliesst `confirm-booking` erfolgreich ab, wird die Buchung sofort verbindlich. Core erstellt dann genau eine offene Rechnung und verschickt automatisch nur die Buchungsbestätigung (`booking.confirmed`).

Die Rechnungsmail ist bewusst zurückgestellt, bis die QR- und Zahlungsdaten und die Vorlage freigegeben sind. Eine Freigabe durch das Büro ist nicht nötig. Das Büro kann die Buchung später wie gewohnt bearbeiten.

## Umfang

**1. Verbindlicher Status (nur neue Rechnungsbuchungen)**
- Im Rechnungszweig setzt `confirm-booking`:
  - `status = "confirmed"` statt `invoice_pending`;
  - `payment_method = "invoice"`;
  - das Fälligkeitsdatum.
- `paid_amount` bleibt unverändert. Es entsteht genau eine offene Rechnung über das bestehende `issueInvoice`.
- Die Antwort ergänzt die bisherigen Felder um:
  - `status: "confirmed"` und `payment_status: "invoice_open"`;
  - `invoice_number` und `due_date`;
  - `guest_message: "Ihre Buchung ist verbindlich bestätigt. Die Rechnung mit Zahlungsinformationen erhalten Sie separat."`;
  - `delivery: { booking_confirmation: <status> }`.
- Ein Replay liefert weiterhin `already_confirmed`, ergänzt um `guest_message`, wenn eine offene Rechnung besteht.
- Bestehende `invoice_pending`-Tickets bleiben unverändert.
- Onlinezahlung sowie Ablauf und Stornierung von Reservationen bleiben unverändert.

**2. Nur die Buchungsbestätigung wird verschickt**
- Es gibt einen dauerhaften Versandeintrag pro Buchung, nur für die Art `booking_confirmation`, mit eindeutigem `idempotency_key` und atomarem Statuswechsel.
- Für `invoice.created` wird in Phase 1 nichts erstellt, versucht, angezeigt oder wiederholt.
- Es werden keine Zahlungsangaben gespeichert oder versendet.

**3. Fehlerverhalten Bestätigung**
- Jede Buchung löst genau einen Sendeversuch aus.
- Scheitert er, bleibt die Buchung trotzdem erfolgreich. Der Eintrag steht dann auf `failed`, mit Code und Text.
- Fehlt die Vorlage oder ist sie inaktiv, wird `failed` mit `template_missing` gespeichert. Es gibt keinen Ersatztext.
- Ein Platzhalter ohne dokumentierten Wert ergibt `failed` mit `template_unknown_variable`.
- Es gibt keinen Cron, keinen Worker und keine automatische Wiederholung.

**4. Büro-Anzeige in der Buchungsdetailansicht**
Nur bei Buchungen, die auf diesem Weg entstanden sind (erkennbar am vorhandenen Bestätigungseintrag):
- Die bestehenden Anzeigen für Status (bestätigt) und Rechnung (offen) bleiben.
- „Buchungsbestätigung: gesendet / fehlgeschlagen (Grund)“.
- „Rechnungsversand ausstehend – wird nach Zahlungsfreigabe aktiviert“, als reiner Hinweis ohne Aktion.
- Nur bei fehlgeschlagener Bestätigung und vorhandener aktiver Vorlage: „Bestätigung erneut senden“, nur für Büro und Admin.

## Nicht geändert
- Scheduler, Privatlektionen, der Buchungsassistent und die manuellen Abläufe im Büro.
- Inbox und Vermietung.
- Onlinezahlung sowie Ablauf und Stornierung von Reservationen.
- `send-notification`, `create-reservation`, `issueInvoice` und das Rechnungsmodell.
- Die Vorlage `invoice.created` und bestehende `invoice_pending`-Tickets.
- Onepager: Er folgt in der nächsten Phase.

## Technische Details

**Migration (additiv; Rollback-Datei `supabase/rollback/bplus_phase1_rollback.sql`)**
```text
booking_email_deliveries
  id uuid pk
  ticket_id uuid not null -> tickets
  kind text not null check (kind in ('booking_confirmation'))  -- später erweiterbar
  idempotency_key text not null unique      -- 'ticket:<ticket_id>:booking_confirmation'
  recipient_email text not null
  status text not null default 'pending' check (status in ('pending','sending','sent','failed'))
  attempts int not null default 0
  last_error_code text, last_error text
  template_id uuid null, email_log_id uuid null -> email_logs
  provider_message_id text, sent_at timestamptz
  created_at, updated_at (Trigger update_updated_at_column)
  unique (ticket_id, kind)
```
- Rechte: `service_role` erhält ALL, `authenticated` erhält SELECT.
- RLS: SELECT nur für `is_admin_or_office(auth.uid())`.
- Kein anon, keine Schreibrechte aus dem Browser.
- Neue Spalte `email_logs.delivery_id uuid null`.

**`_shared/bookingDelivery.ts`**
- `ensureConfirmationDelivery(ticketId, email)`: Insert mit `ON CONFLICT (idempotency_key) DO NOTHING`.
- `attemptConfirmation(id, { manual })`:
  1. Atomarer Claim: `UPDATE … SET status='sending', attempts=attempts+1 WHERE id=$1 AND status IN ('pending'[, 'failed' bei manual]) RETURNING *`. Ohne Treffer wird nicht gesendet.
  2. Vorlage `booking.confirmed` muss aktiv sein.
  3. Flache Variablen, HTML-escaped, nur aus Serverdaten: `ticket_number`, `customer_salutation`, `customer_last_name`, `product_name`, `booking_date`, `booking_time`, `meeting_point`. Bei mehreren Positionen gilt der erste Termin.
  4. Resend mit `Idempotency-Key = idempotency_key` und dem bisherigen Absender.
  5. Eine Zeile in `email_logs` schreiben und `sent` oder `failed` setzen.

**`confirm-booking`**
- Nur der Rechnungszweig ändert sich: Status, dazu `ensureConfirmationDelivery` und `attemptConfirmation` in einem eigenen try/catch, ausserdem die neuen Antwortfelder.
- Keine personenbezogenen Daten zusätzlich in der Antwort.

**Neue Funktion `retry-booking-confirmation`**
- `verify_jwt = true` in `supabase/config.toml`, dazu `requireRole(['office','admin'])`.
- Antworten:
  - 401 ohne Token;
  - 403 bei anderer Rolle;
  - 409, wenn nicht `failed`;
  - 409 `template_not_configured`, solange die Vorlage fehlt oder inaktiv ist; der Status ändert sich dann nicht.
- Body `{ delivery_id: uuid }` (zod), gleicher `idempotency_key`.

**Frontend (Backoffice)**
- `BookingDetail.tsx` liest `booking_email_deliveries` und zeigt die Zeilen aus Punkt 4.
- Retry über `supabase.functions.invoke('retry-booking-confirmation')`.

## Tests
- Deno-Unit:
  - Variablenbefüllung mit Escaping;
  - unbekannte Variable → `failed`;
  - fehlende oder inaktive Vorlage → `failed` ohne Ersatztext;
  - der Claim verhindert Doppelversand.
- Staging mit synthetischen Daten an eine von dir freigegebene Testadresse:
  - T1: Rechnungsbuchung → `confirmed`, 1 offene Rechnung, 1 Bestätigungseintrag `sent`, kein Rechnungseintrag, `guest_message` korrekt.
  - T2: Replay → `already_confirmed`, weiterhin 1 Rechnung und 1 Eintrag, kein zweiter Versand.
  - T3: Vorlage inaktiv → `failed` mit `template_missing`, Retry ergibt 409.
  - T4: Provider-Fehler → `failed`. Ein Retry aus dem Büro sendet einmal, ein paralleler Doppel-Retry ebenfalls nur einmal.
  - T5: Onlinezahlung unverändert, kein Eintrag.
  - T6: Abgelaufene Reservation → 410, kein Eintrag.
  - T7: Retry ohne JWT → 401, als Lehrperson oder ohne Rolle → 403.
  - T8: anon und Nicht-Büro können die Tabelle nicht lesen.
  - T9: Bestehende `invoice_pending`-Tickets bleiben unverändert.
- Build, Lint und die bestehenden Tests laufen.
- Nichts wird veröffentlicht oder zusammengeführt.

## Offene Punkte
- Testadresse für den Staging-Versand.
- Der Klicktest im Büro ist ohne Büro-Login nicht möglich.
