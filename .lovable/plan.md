# B+ Phase 1: Website-Buchungen auf Rechnung sofort verbindlich

## Ziel
Für `payment_method = "invoice"` gilt: Sobald der Gast `confirm-booking` erfolgreich abschliesst, ist die Buchung verbindlich. Core erstellt genau eine offene Rechnung und verschickt serverseitig automatisch zwei E-Mails: die Buchungsbestätigung und die Rechnung. Das Büro muss nichts freigeben, kann die Buchung aber später wie gewohnt bearbeiten.

## Ausgangslage (geprüft)
- `confirm-booking` finalisiert Kunde und Teilnehmende über `finalize_provisional_reservation`. Danach setzt die Funktion den Status `invoice_pending`, erstellt über `issueInvoice` eine offene Rechnung und verschickt **keine** E-Mail.
- E-Mails gehen heute direkt an Resend (`submit-booking-request`, `send-notification`) und werden in `email_logs` protokolliert. `email_logs` hat keine Verknüpfung zum Ticket oder zur Rechnung, nur `metadata`.
- Aktive Vorlagen gibt es bereits: `booking.confirmed` („Buchungsbestätigung - {{ticket_number}}“) und `invoice.created` („Rechnung {{invoice.number}} …“).
- `send-notification` läuft mit `verify_jwt = false` und bleibt unverändert. Der neue Weg ruft diese Funktion nicht auf.

## Umfang

**1. Verbindlicher Status**
- Neue Rechnungsbuchungen aus `confirm-booking` bekommen `status = "confirmed"`, `payment_method = "invoice"` und ein Fälligkeitsdatum.
- Das Geld gilt damit **nicht** als bezahlt: `paid_amount` bleibt unverändert, und die offene Rechnung zeigt, dass noch gezahlt werden muss.
- Die Antwort an den Onepager meldet `status: "confirmed"`, `payment_status: "invoice_open"`, die Rechnungsnummer und das Fälligkeitsdatum.
- Wiederholte Aufrufe liefern weiterhin `already_confirmed`. Das gilt auch für bestehende `invoice_pending`-Tickets, die nicht umgestellt werden.
- Onlinezahlung, Ablauf und Stornierung von Reservationen bleiben unverändert.

**2. Dauerhaftes Versandprotokoll (Punkt 3, fortgesetzt)**
Neue additive Tabelle `booking_email_deliveries`, verknüpft mit Ticket und Rechnung. Sie legt dauerhaft fest, dass pro Buchung jede Mail-Art genau einmal zugestellt wird, und hält jeden Versuch nachvollziehbar fest. `email_logs` bleibt als Protokoll pro Versandversuch bestehen und wird verknüpft.

**3. Serverseitiger Versand mit Wiederholung**
- `confirm-booking` legt beide Versandeinträge an und versucht den Versand sofort.
- Scheitert der Versand, bleibt die Buchung trotzdem erfolgreich. Der Eintrag bleibt dann `failed` und wird automatisch erneut versucht.
- Ein geplanter Server-Job versucht fehlgeschlagene Mails bis zu 5-mal mit wachsendem Abstand erneut. Danach steht der Eintrag auf `failed`, und das Büro sieht das.

**4. Kleine Büro-Anzeige**
- In der Buchungsdetailansicht erscheint eine Zeile „E-Mail-Versand“ mit dem Status von Bestätigung und Rechnung: gesendet, fehlgeschlagen oder ausstehend.
- Dazu gibt es einen Knopf „Erneut senden“, nur für Büro und Admin.
- Sonst ändert sich an den Buchungsschritten im Büro nichts.

## Nicht geändert
Scheduler, Privatlektionen, Buchungsassistent und manuelle Abläufe im Büro, Inbox, Vermietung, Onlinezahlung, Ablauf und Stornierung von Reservationen, `send-notification`, `create-reservation`, Rechnungsmodell und `issueInvoice`. Der Onepager wird erst nach dieser Phase angepasst.

## Technische Details

**Migration (additiv, Rollback-Skript `supabase/rollback/bplus_phase1_rollback.sql`)**
```text
booking_email_deliveries
  id uuid pk, ticket_id uuid not null -> tickets, invoice_id uuid null -> invoices
  kind text not null check (kind in ('booking_confirmation','invoice'))
  recipient_email text not null
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','skipped_test'))
  attempts int not null default 0, next_attempt_at timestamptz default now()
  last_error text, provider_message_id text, email_log_id uuid -> email_logs
  sent_at timestamptz, created_at, updated_at
  unique (ticket_id, kind)
```
- Grants: `ALL` an service_role, `SELECT` an authenticated. RLS mit einer SELECT-Policy `is_admin_or_office(auth.uid())`. Kein anon-Zugriff, keine Schreibrechte für den Browser.
- Neue Spalte `email_logs.delivery_id uuid null`, additiv.

**Neue geteilte Datei `_shared/bookingDelivery.ts`**
- `ensureDeliveries(ticket, invoice, email)`: legt beide Einträge mit `ON CONFLICT DO NOTHING` an.
- `attemptDelivery(id)`:
  - atomarer Claim `pending|failed → sending` mit `attempts < 5` und `next_attempt_at <= now()`;
  - lädt die Vorlage (`booking.confirmed` bzw. `invoice.created`) und füllt sie HTML-escaped mit Serverdaten aus Ticket, Positionen, Rechnung und `payment_snapshot` (Betrag, Fälligkeit, Zahlungsreferenz/IBAN);
  - Resend-Aufruf mit `Idempotency-Key: ticket-<id>-<kind>`, Absender wie bisher;
  - `@smoke.invalid` ergibt `skipped_test`;
  - schreibt die Zeile in `email_logs`;
  - bei Erfolg `sent`; bei der Rechnung zusätzlich `invoices.sent_at`;
  - bei Fehler `failed` mit Backoff 5, 15, 60 und 240 Minuten.
- Keine PDF-Anlage. Die Rechnungsmail enthält die Zahlungsangaben aus dem unveränderlichen Snapshot.

**`confirm-booking` (nur der Rechnungszweig)**
- Status `confirmed` statt `invoice_pending`.
- Nach der Rechnung werden `ensureDeliveries` und `attemptDelivery` für beide Einträge aufgerufen, jeweils mit try/catch, sodass die Buchungsantwort nie scheitert.
- Die Antwort ergänzt `delivery: { booking_confirmation, invoice }` mit Statuswerten, ohne personenbezogene Daten.

**Neue Funktion `retry-booking-deliveries`** (`verify_jwt = false`, Autorisierung im Code)
- Aufruf durch den Cron-Job: Header mit neuem Secret `DELIVERY_CRON_SECRET`.
- Aufruf aus dem Büro: `requireRole(['office','admin'])` mit einer `delivery_id`. Das setzt `attempts` zurück und versucht sofort erneut.
- pg_cron alle 5 Minuten per `net.http_post`. Das Einrichten erfolgt über run_sql, nicht als Migration.

**Frontend**
- `BookingDetail.tsx` liest `booking_email_deliveries` (RLS: nur Büro) und ruft für „Erneut senden“ `supabase.functions.invoke('retry-booking-deliveries')` auf.

## Tests
- **Deno-Unit:** Variablenbefüllung/Escaping, Backoff, Claim-Logik für einen schon gesendeten Eintrag (kein zweiter Versand).
- **Staging-Matrix mit `@smoke.invalid` und synthetischen Daten**, ohne echten Versand:
  - T1 Rechnungsbuchung ergibt `confirmed`, 1 offene Rechnung, 2 Einträge `skipped_test`.
  - T2 Replay von `confirm-booking` ergibt `already_confirmed`, weiterhin 1 Rechnung und 2 Einträge.
  - T3 Simulierter Provider-Fehler ergibt `failed` mit `next_attempt_at`; der Retry-Job sendet genau einmal.
  - T4 Onlinezahlung ist unverändert: keine Einträge, keine Rechnung.
  - T5 Abgelaufene Reservation ergibt 410, keine Einträge.
  - T6 `retry-booking-deliveries` ohne Secret bzw. mit Lehrperson ergibt 401/403; Büro-Retry funktioniert.
  - T7 anon/authenticated ohne Büro-Rolle kann `booking_email_deliveries` nicht lesen.
- Build, Lint und bestehende Tests laufen. Nichts wird veröffentlicht.

## Offene Punkte
- Ein echter Zustelltest an eine reale Adresse braucht deine Freigabe.
- Office-Klicktest ist blockiert, weil kein Büro-Login vorhanden ist.
