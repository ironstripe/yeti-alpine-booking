# B+ Phase 2: QR-Rechnung und Zahlungsprovider-Anbindung

## Ausgangslage (B+ Phase 1, umgesetzt)

Website-Buchungen mit `payment_method = "invoice"` werden sofort verbindlich: `confirm-booking` legt genau eine offene Rechnung an, setzt `status = confirmed` und versendet die Buchungsbestätigung (`booking_email_deliveries`, kind `booking_confirmation`). Der Rechnungsversand war bewusst zurückgestellt („Rechnungsversand ausstehend"). Onlinezahlungen verlangten eine vom Aufrufer gelieferte `payment_reference` – also einen Wert, der nicht serverseitig geprüft wurde.

Phase 2 schliesst beide Lücken: die Rechnung geht jetzt automatisch mit Swiss-QR-Zahlungsteil raus, und Onlinezahlungen werden erst akzeptiert, wenn der Provider sie bestätigt hat.

## Umfang

**1. QR-Rechnung im Rechnungsversand**
- `_shared/swissQrBill.ts` baut den Zahlungsteil ausschliesslich aus dem unveränderlichen `invoices.payment_snapshot` (IBAN, Referenz, Betrag, Zahlbar an, Zahlbar durch, Zusatzinfo). Der Snapshot wird nie neu berechnet.
- `_shared/qrCode.ts` rendert den QR-Code als PNG-Daten-URL (Mail-Client-sicher) und liefert die Base64-Daten für den Anhang `QR-Rechnung-<Nr>.png`.
- Vorlage `invoice.created` erhält den Platzhalter `{{invoice.qr_payment_part}}` (Roheinsatz, nicht escaped, aus Servermarkup). Alle übrigen Platzhalter bleiben HTML-escaped.
- Ohne Zahlungs-Snapshot oder bei fehlgeschlagenem QR-Rendering wird nichts versendet; der Versand steht auf `failed` mit `payment_snapshot_missing` bzw. `qr_render_failed`.

**2. Automatischer Rechnungsversand**
- `_shared/invoiceDelivery.ts` mit `ensureInvoiceDelivery` (ein Zustelleintrag pro Rechnung, `idempotency_key = invoice:<id>:invoice_created`) und `attemptInvoiceDelivery` (atomarer Claim, genau ein automatischer Versuch, Büro-Retry nur bei `failed`).
- `confirm-booking` stösst den Rechnungsversand nach erfolgreicher Rechnungsstellung an; ein Versandfehler macht die Buchung nicht ungültig.
- Antwort von `confirm-booking` (Rechnungszweig) zusätzlich: `delivery.invoice` und `guest_message` nennt die zugestellte Rechnung.

**3. Zahlungsprovider (Stripe), serverseitig und fail-closed**
- `create-payment-session` (öffentlich, `x-api-key`): prüft Reservierungstoken und Ablauf, nimmt den Betrag ausschliesslich aus `tickets.total_amount`, lässt nur Rückleitungs-URLs aus `YETI_ALLOWED_REDIRECT_ORIGINS` zu, verlängert die Reservierung auf das Checkout-Fenster und verwendet eine noch offene Session wieder.
- `webhook-payment` (öffentlich, Authentifizierung = Stripe-Signatur): verifiziert `Stripe-Signature` gegen `STRIPE_WEBHOOK_SECRET` (HMAC-SHA256, Zeitfenster 300 s, Timing-safe-Vergleich), speichert jedes Event genau einmal in `payment_events` und verarbeitet:
  - `checkout.session.completed` / `checkout.session.async_payment_succeeded` (bezahlt ⇒ Payment + Ticket),
  - `payment_intent.succeeded` (Fallback, wenn das Session-Event ausbleibt),
  - `payment_intent.payment_failed`, `checkout.session.expired`, `charge.refunded`.
- `confirm-booking` akzeptiert Onlinezahlungen nur noch mit `payment_session_id`; die session wird serverseitig gegen Provider und Ticketbetrag geprüft (`verifyOnlinePayment`). Eine ungeprüfte `payment_reference` führt zu `402 payment_not_verified`.
- `applyPaidSession` bucht idempotent genau eine `payments`-Zeile (`reference` = Payment-Intent) und setzt das Ticket auf bezahlt. Ist die Buchung noch nicht finalisiert, bleibt sie als bezahlte Reservierung buchbar (`payment_pending` + verlängerte Haltefrist `PAID_HOLD_MINUTES = 30`), damit nie Geld ohne Slot eingeht.

**4. Backoffice**
- `BookingEmailDeliveryCard` zeigt jetzt beide Zustellarten (Bestätigung und Rechnung) inkl. Fehlergrund und Retry.
- Neu `OnlinePaymentStatusCard`: reine Anzeige der Zahlungsversuche (Betrag, Status, Session-Id).
- `retry-booking-confirmation` ist kind-aware (Bestätigung und Rechnung), Endpunktname und Body bleiben unverändert.

## Vertragsänderung für die Website

| Schritt | vorher | jetzt |
| --- | --- | --- |
| Onlinezahlung starten | – | `POST /create-payment-session` mit `ticket_id`, `reservation_token`, `success_url`, `cancel_url` ⇒ `checkout_url` |
| Zahlung abschliessen | `POST /confirm-booking` mit `payment_reference` | `POST /confirm-booking` mit `payment_session_id` (aus `create-payment-session`) |
| Rückkehr des Gastes | – | Statusabfrage wie bisher über `/get-booking-status` |

Rechnungsbuchungen bleiben unverändert (`payment_method = "invoice"`), erhalten aber zusätzlich `delivery.invoice`.

## Konfiguration (Secrets/Env)

| Name | Zweck | Verhalten ohne Wert |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Checkout-Sessions, Session-Rückfrage | `create-payment-session` ⇒ 503 `payment_provider_not_configured` |
| `STRIPE_WEBHOOK_SECRET` | Signaturprüfung der Webhooks | `webhook-payment` ⇒ 503 `webhook_not_configured` |
| `YETI_ALLOWED_REDIRECT_ORIGINS` | erlaubte Rückleitungs-Origins, kommagetrennt | `create-payment-session` ⇒ 503 `payment_redirect_not_configured` |
| `RESEND_API_KEY` | Versand der Rechnungsmail | Versand `failed` (`provider_error`) |

Webhook-Endpunkt: `https://<project-ref>.supabase.co/functions/v1/webhook-payment`; zu abonnieren: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`.

## Migration

`supabase/migrations/20261001090000_bplus_qr_invoice_payment_provider.sql` (additiv):
- `booking_email_deliveries.kind` erlaubt zusätzlich `invoice`,
- `payment_sessions` (ein offener Checkout pro Ticket, Betrag/Währung/Status, Provider-Referenzen),
- `payment_events` (jedes Webhook-Event genau einmal, `provider_event_id` unique),
- Rechnung, Bestätigung, `service_role` ALL, `authenticated` SELECT nur über `is_admin_or_office`, kein anon,
- Vorlage `invoice.created` mit QR-Platzhalter.

Rollback: `supabase/rollback/bplus_qr_payment_rollback.sql`.
Schema-Test: `supabase/tests/payment_provider_bplus_test.sql` (transaktional, mit `ROLLBACK`).

## Tests

Deno-Unit-Tests (ohne Netz und ohne DB, Provider/Resend/QR-Renderer injiziert):
- `_shared/swissQrBill.test.ts`: Referenzformate, Escaping, fehlender QR-Code, SEPA-Fall, Textvariante.
- `_shared/invoiceDelivery.test.ts`: ein Versand pro Rechnung, Anhang + QR im HTML, `template_missing`, `invoice_not_open`, `payment_snapshot_missing`, unbekannter Platzhalter, `qr_render_failed`, Nebenläufigkeit, manueller Retry.
- `_shared/paymentProvider.test.ts`: Signaturprüfung (gültig, falsches Secret, manipulierter Body, Replay, Schlüsselrotation), Betrags-/Währungsvergleich, Checkout-Parameter, Fail-closed ohne Secret.
- `_shared/paymentSessions.test.ts`: Live-Session-Auswahl, idempotente Zahlungsbuchung, Haltefrist, Betragsabweichung, Event-Idempotenz, Verifikationspfade inkl. Provider-Fallback und Rückerstattung.

Staging-Abnahme (offen, siehe Statusdokument): echte Testbuchung mit Test-Karte, Webhook-Zustellung, Rechnungseingang mit funktionierendem QR-Code in der Banking-App.

## Grenzen dieses Schritts

- Der Rechnungsanhang ist das QR-Bild (`QR-Rechnung-<Nr>.png`), kein vollständiges QR-Rechnungs-PDF; der Zahlungsteil steht vollständig im Mail-HTML. Ein serverseitiges PDF ist der nächste Schritt.
- Keine automatische Zahlungserinnerung/Mahnung (Vorlagen `payment.reminder`/`payment.overdue` bestehen, sind aber nicht angebunden).
- Keine Teilzahlungen oder Gutschriften; eine Rückerstattung wird erfasst und angezeigt, aber nicht automatisch verrechnet.