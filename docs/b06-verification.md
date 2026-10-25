# B06 — Rechnungsversand aus Buchungsdetails (F03 / HB057, HB086, HB093)

Stand: lokal implementiert und getestet. **Nichts deployt, keine Migration installiert, keine echten E-Mails.** B02-Hosted-Retest bleibt unakzeptiert.

## Geänderte / neue Dateien

- `supabase/functions/_shared/invoicePdf.ts` (neu): A4-PDF via `pdf-lib` (Deno-kompatibel, kein externer Dienst) aus der persistierten Rechnung + eingefrorenem `payment_snapshot`. Swiss-QR-Zahlteil nur bei `swiss_qr` (QR-Payload aus dem Snapshot, Schweizer Kreuz als Vektoren); Banküberweisung ohne QR. Gleiche Fail-closed-Codes wie `invoiceDocument.ts` (`invoice_not_open`, `payment_details_missing`, `qr_mismatch`).
- `supabase/functions/_shared/courseDelivery.ts`: Invoice-Anhang jetzt PDF (`application/pdf`, `.pdf`, base64-Bytes); `ensureDelivery`/`invoiceContent` akzeptieren optionale `invoice_id` (exakte persistierte Rechnung, Ticket-Bindung, Status `open`). Website-Kursfluss ohne `invoice_id` unverändert; bereits eingefrorene HTML-Payloads werden bei Retry unverändert wiederverwendet.
- `supabase/functions/send-invoice/` (neu, `handler.ts` + `index.ts`): staff-only (`admin`/`office` via `requireRole`), strikter Body `{invoice_id, action: status|send}` — kein Client-Empfänger, kein HTML, kein `force`. Empfänger serverseitig: `billing_partners.billing_email` bei Partnerrechnung, sonst `customers.email`. Schreibt **nie** `invoices.status`/`sent_at` oder Finanzspalten.
- `drizzle/migrations/0017_b06_invoice_delivery.sql` (pending, NICHT installiert): nullable `booking_email_deliveries.invoice_id`. Bestehende `UNIQUE(ticket_id, kind)` bleibt — eine Ersatzrechnung zum selben Ticket kann die alte Zustellung nie wiederverwenden (`needs_review: different_invoice_bound`).
- `src/hooks/useInvoices.ts`: `useSendInvoice` ruft jetzt `send-invoice` (statt generischem `send-notification` mit Client-Empfänger); kein blinder `status=sent`-Write mehr; HTTP200 mit `success:false` wird als Fehler behandelt. Neu: `useInvoiceDeliveryStatus` + `invoiceDeliveryLabel` (unabhängiger Zustellstatus: kein Empfänger / nicht gesendet / in Prüfung / fehlgeschlagen / gesendet).
- `src/pages/BookingDetail.tsx`: Senden-Button für **offene** (ausgestellte) Rechnungen statt `draft`; Entwürfe laufen weiter über den Ausstellungsfluss. Zustellstatus-Badge unabhängig vom Finanzstatus.
- Tests: `supabase/functions/_shared/invoicePdf.test.ts`, `tests/b06InvoiceDelivery.integration.ts`.

## Testergebnisse (lokal, synthetisch, Fake-Transport)

- `tests/b06InvoiceDelivery.integration.ts` (Baseline + NUR B04+B06 SQL, lokale Postgres/PostgREST): **10/10** — PDF-Versand mit byte-identischer Rechnungszeile; Entwurf/bezahlt nie versendet; Partner-E-Mail hoheitlich; fehlende E-Mail → `no_recipient` ohne Transport; Provider-Reject → `failed`, Retry genau einmal; parallele Sends → eine Übergabe; Unknown <24h gleiche Bytes+Schlüssel, abgelaufen/Digest-Bruch → `needs_review`; fremdgebundene Rechnung → Review; 401/403/strikter Body/fehlende Vorlage/fehlende B06-Spalte (503) fail-closed; RLS verbirgt Inhalte für anon/teacher.
- `invoicePdf.test.ts`: **3/3** (PDF-Magic, Mehrseiten-Umbruch, QR-Bild eingebettet; fail-closed; Nicht-QR ohne Bild).
- PDF-QA mit Poppler/zbar: Text (Umlaute, lange Namen, Totale, Zahlteil) vollständig; eingebetteter QR **aus der gerenderten Seite** dekodiert und byteweise identisch mit dem gespeicherten Snapshot-Payload (IBAN, Gläubiger, Betrag 2200.00 CHF, QRR-Referenz). Gefundene und behobene QA-Fehler: `·`→`?` (WinAnsi-Bereich), Empfangsschein-Textüberlauf (Wrapping), fehlerhafte Kreuz-Geometrie (QR nicht dekodierbar).
- Deno-Check der geänderten Funktionen und Vite-Preview-Build: OK.

## Grenzen / ausstehend

- Zeilenbeschreibungen kommen wie bisher aus aktuellen Ticket-Positionen; Beträge/Referenz/Snapshot aus der Rechnungszeile. Historische eingefrorene HTML-Payloads bleiben unverändert.
- `bc_2627_reservations` existiert im lokalen Testschema nur als Stub.
- Kein Browser-E2E dieser Runde (Zeit); UI-Verdrahtung per Typecheck/Build abgesichert — **HB057/086/093 UI-Retest ausstehend**.
- B04 + B06 SQL und die Function `send-invoice` sind **nicht installiert/deployt**.

## Release-Reihenfolge (später, koordiniert)

1. B04 SQL installieren, 2. B06 SQL installieren, 3. `send-invoice` deployen, 4. Frontend freigeben. Rollback consumer-first: Frontend-Schalter entfernen → Function entfernen → Spalte `invoice_id` bleibt (additiv, historische Belege bleiben erhalten).
