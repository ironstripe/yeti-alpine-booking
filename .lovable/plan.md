# B+ Phase 1: Website-Buchungen auf Rechnung sofort verbindlich (revidiert)

## Ziel
Bei `payment_method = "invoice"` wird die Buchung verbindlich, sobald der Gast `confirm-booking` erfolgreich abschliesst. Core erstellt dabei genau eine offene Rechnung und verschickt serverseitig zwei E-Mails: die Buchungsbestätigung und eine Rechnungsmitteilung. Eine Freigabe durch das Büro ist nicht nötig. Das Büro kann die Buchung später wie bisher bearbeiten.

## Ausgangslage (geprüft)
- `confirm-booking` finalisiert heute Kunde und Teilnehmende, setzt den Status `invoice_pending`, erstellt über `issueInvoice` eine offene Rechnung und verschickt keine E-Mail.
- Die Vorlage `booking.confirmed` ist aktiv. Sie nutzt die Variablen `ticket_number`, `customer_salutation`, `customer_last_name`, `product_name`, `booking_date`, `booking_time` und `meeting_point`.
- Die Vorlage `invoice.created` ist aktiv. Sie nutzt `invoice.number`, `invoice.total`, `invoice.due_date`, `customer.first_name`, `customer.last_name` und `school.name`. Ihr Text enthält **heute Zahlungsangaben** (Treffer auf IBAN/QR/Konto/Überweisung).
- `send-notification` bleibt unverändert und wird nicht verwendet.

## Umfang

**1. Verbindlicher Status (nur neue Rechnungsbuchungen)**
- `confirm-booking` setzt im Rechnungszweig `status = "confirmed"`, `payment_method = "invoice"` und das Fälligkeitsdatum. `paid_amount` bleibt unverändert, die offene Rechnung bleibt offen.
- Die Antwort an den Onepager lautet `status: "confirmed"`, `payment_status: "invoice_open"`, dazu Rechnungsnummer und Fälligkeitsdatum.
- Wiederholte Aufrufe ergeben weiterhin `already_confirmed`.
- Bestehende `invoice_pending`-Tickets bleiben unverändert. Es gibt keine Umstellung und keine Nachsendung.
- Onlinezahlung sowie Ablauf und Stornierung von Reservationen bleiben unverändert.

**2. Dauerhaftes Versandprotokoll**
- Neue Tabelle `booking_email_deliveries` mit genau einem Eintrag pro Buchung und Mail-Art (`booking_confirmation`, `invoice`), verknüpft mit Ticket und Rechnung.
- Jeder Eintrag hat einen eindeutigen `idempotency_key`.
- Statuswechsel laufen atomar: `pending → sending → sent | failed`.

**3. Versand nur einmal und nur serverseitig**
- `confirm-booking` legt beide Einträge an und versucht jeden genau einmal.
- Scheitert der Versand, bleibt die Buchung trotzdem erfolgreich und der Eintrag steht auf `failed`.
- Es gibt keine automatische Wiederholung, keinen Cron und keinen Worker.

**4. Manuelles „Erneut senden“ nur für Büro/Admin**
- In der Buchungsdetailansicht erscheint eine Zeile „E-Mail-Versand“ mit dem Status beider Mails und dem Fehlertext.
- Der Knopf „Erneut senden“ ist nur für Büro und Admin sichtbar und nur bei `failed` aktiv.
- Fehlt die Vorlage oder ist sie inaktiv bzw. nicht konform, bleibt der Knopf deaktiviert. Der Hinweis lautet dann „Vorlage fehlt oder ist nicht freigegeben“.

**5. Inhalt der Mails**
- **Bestätigung:** nur die dokumentierten Variablen der Vorlage `booking.confirmed`.
- **Rechnung:** nur Rechnungsnummer, Gesamtbetrag, Fälligkeitsdatum sowie Name und Schule.
- Nicht enthalten sind QR, IBAN, Zahlungsreferenz, Zahlungslink, PDF oder Zahlungsanweisungen.

## Nicht geändert
Scheduler, Privatlektionen, der Buchungsassistent und manuelle Abläufe im Büro, Inbox, Vermietung, Onlinezahlung, Ablauf und Stornierung von Reservationen, `send-notification`, `create-reservation`, das Rechnungsmodell, `issueInvoice` und bestehende `invoice_pending`-Tickets. Den Onepager passe ich erst nach dieser Phase an.

## Technische Details

**Migration (additiv; Rollback in `supabase/rollback/bplus_phase1_rollback.sql`)**
```text
booking_email_deliveries
  id uuid pk
  ticket_id uuid not null -> tickets
  invoice_id uuid null -> invoices
  kind text not null check (kind in ('booking_confirmation','invoice'))
  idempotency_key text not null unique       -- 'ticket:<ticket_id>:<kind>'
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed'))
  attempts int not null default 0
  last_error_code text, last_error text
  template_id uuid null, email_log_id uuid null -> email_logs
  provider_message_id text, sent_at timestamptz
  created_at, updated_at (Trigger update_updated_at_column)
  unique (ticket_id, kind)
```
- Grants: `ALL` für `service_role`, `SELECT` für `authenticated`. RLS-Policy `SELECT` nur mit `is_admin_or_office(auth.uid())`. Kein Zugriff für anon, keine Schreibrechte aus dem Browser.
- `email_logs` erhält die additive Spalte `delivery_id uuid null`.

**Neues Shared-Modul `_shared/bookingDelivery.ts`**
- `ensureDeliveries(ticketId, invoiceId)`: Insert mit `ON CONFLICT (idempotency_key) DO NOTHING`.
- `attemptDelivery(id, {manual})`:
  - Atomarer Claim `UPDATE … SET status='sending', attempts=attempts+1 WHERE id=$1 AND status IN ('pending'[, 'failed' nur bei manual]) RETURNING *`. Ohne Treffer gibt es keinen Versand.
  - Vorlage per `trigger` laden. Fehlt sie oder ist sie inaktiv, wird `failed` mit `template_missing` gesetzt, ohne Fallback-Text.
  - Konformitätsprüfung der Rechnungsvorlage: Enthält sie andere Variablen als die erlaubten oder Zahlungswörter (IBAN/QR/Konto/Überweisung/Zahlungslink), wird `failed` mit `template_not_compliant` gesetzt und nichts versendet.
  - Variablen als flache Key/Value-Map, Werte HTML-escaped und ausschliesslich aus Serverdaten. Die Schlüssel entsprechen exakt den dokumentierten Platzhaltern, auch den Namen mit Punkt wie `invoice.number`. Unbekannte Platzhalter führen zu `failed`, mit Fehlercode `template_unknown_variable`.
  - Resend-Aufruf mit `Idempotency-Key = idempotency_key` und dem bisherigen Absender. Pro Aufruf wird eine Zeile in `email_logs` geschrieben.
  - Bei Erfolg wird `sent` gesetzt. Bei der Rechnung zusätzlich `invoices.sent_at`.
  - Bei einem Fehler wird `failed` mit Code und Text gesetzt. Es gibt keine Zeitsteuerung und kein `next_attempt_at`.

**`confirm-booking` (nur im Rechnungszweig)**
- Setzt `confirmed` statt `invoice_pending`.
- Nach der Rechnung laufen `ensureDeliveries` und je ein `attemptDelivery`, jeweils in einem eigenen try/catch. Ein Versandfehler lässt die Buchungsantwort nicht scheitern.
- Die Antwort ergänzt `delivery: { booking_confirmation: status, invoice: status }` und enthält keine personenbezogenen Daten.

**Neue Funktion `retry-booking-delivery`**
- `verify_jwt = true` in `supabase/config.toml`.
- Zusätzlich im Code `requireRole(['office','admin'])`. Ohne Token gibt es 401, für Lehrperson oder Nutzer ohne Rolle 403.
- Body `{ delivery_id: uuid }`, validiert mit zod.
- Nur Einträge mit `failed` sind zulässig, sonst kommt 409. Liegt `template_missing` oder `template_not_compliant` weiterhin vor, gibt es 409 `template_not_configured`, ohne Statuswechsel.
- Ruft `attemptDelivery(id, {manual:true})` mit demselben `idempotency_key` auf.

**Frontend**
- `BookingDetail.tsx` liest `booking_email_deliveries` (RLS: nur Büro) und ruft `supabase.functions.invoke('retry-booking-delivery')` auf.

## Voraussetzung vor Versand der Rechnungsmail
Die aktive Vorlage `invoice.created` enthält heute Zahlungsangaben und würde deshalb als `template_not_compliant` abgelehnt. Sie muss durch das Büro angepasst werden. Wahlweise passe ich nach deiner Freigabe den Vorlagentext an: nur noch Nummer, Betrag, Fälligkeit, Name und Schule. Bis dahin bleibt die Rechnungsmail `failed`, und „Erneut senden“ ist deaktiviert. Die Buchungsbestätigung ist davon nicht betroffen.

## Tests
- **Deno-Unit:** flache Variablenbefüllung mit Escaping, unbekannte Variable → failed, fehlende oder inaktive Vorlage → failed ohne Fallback, Konformitätsprüfung, Claim verhindert Doppelversand.
- **Staging** mit synthetischen Daten an eine von dir freigegebene Testadresse (ohne Freigabe kein Versand):
  - T1: Eine Rechnungsbuchung ergibt `confirmed`, 1 offene Rechnung und 2 Einträge.
  - T2: Ein Replay von `confirm-booking` ergibt `already_confirmed`, weiterhin 1 Rechnung und 2 Einträge ohne erneuten Versand.
  - T3: Ist die Vorlage inaktiv, steht der Eintrag auf `failed` mit `template_missing`, und der Retry antwortet mit 409.
  - T4: Ein Provider-Fehler ergibt `failed`. Der Retry durch das Büro sendet genau einmal. Ein paralleler Doppel-Retry sendet nur einmal.
  - T5: Onlinezahlung ist unverändert, es entstehen keine Einträge.
  - T6: Eine abgelaufene Reservation ergibt 410, es entstehen keine Einträge.
  - T7: Retry ohne JWT ergibt 401, als Lehrperson oder Nutzer ohne Rolle 403.
  - T8: anon oder Nutzer ohne Büro-Rolle können die Tabelle nicht lesen.
  - T9: Ein bestehendes `invoice_pending`-Ticket bleibt unverändert.
- Build, Lint und die bestehenden Tests laufen. Nichts wird veröffentlicht.

## Offene Punkte
- Anpassung der Vorlage `invoice.created`: durch das Büro oder durch mich nach deiner Freigabe.
- Testadresse für den Staging-Versand.
- Ein Klicktest im Büro ist ohne Büro-Login nicht möglich.
