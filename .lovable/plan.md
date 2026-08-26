# Plan: Yeti-Schnittstellen für das Website-Buchungssystem

## Bestehende Schnittstellen (Antwort auf die Frage)

Neben `/intake-booking` existieren bereits: `/webhook-email` (eingehende E-Mails), `/booking_requests`-Tabelle (offizieller Einstiegspunkt, anon-INSERT) sowie interne Edge Functions. Es fehlen jedoch: **Verfügbarkeits-API, provisorische Reservierung mit Ablaufzeit, Zahlungs-Abschluss und Rechnungs-Endpunkt** — genau das, was der Website-Prompt braucht.

## Ziel

Yeti liefert alle serverseitigen Funktionen, die die Website für den beschriebenen Buchungsablauf benötigt. Die Website ruft nur diese Endpunkte auf; Yeti bleibt die einzige Datenquelle.

## Neue Endpunkte (Edge Functions, alle mit `YETI_INTAKE_API_KEY` gesichert)

1. **`/get-availability`** (POST)
   - Input: Datum/Zeitraum, Produkt-/Kursart (privat, Gruppe Mo–Fr, Samstag), Dauer, Teilnehmerzahl.
   - Output: freie Zeitfenster mit verfügbaren Lehrern; Gruppenkurse mit Restplätzen; blockierte Zeiten.
   - Berücksichtigt: `ticket_items` (aktive Buchungen), `instructor_absences`, `instructor_recurring_blocks`, Betriebszeiten 09:00–16:00, Kursregeln (Gruppenkurse nur Mo–Fr-Blöcke, Samstagskurse nur samstags).

2. **`/create-reservation`** (POST)
   - Erstellt Ticket mit neuem Status `provisional` + Ablaufzeit (`reservation_expires_at`, Standard 15 Minuten).
   - Atomare Lehrer-Zuteilung per Datenbankfunktion mit `SELECT ... FOR UPDATE` / Advisory Lock — verhindert Doppelbuchungen (Race Condition) bei parallelen Requests.
   - Preis wird **serverseitig aus der `products`-Tabelle** (inkl. `product_price_tiers`) berechnet — nie aus dem Browser übernommen.
   - Output: Reservierungs-ID, Gesamtpreis, Ablaufzeit, Zusammenfassung.

3. **`/confirm-booking`** (POST)
   - Input: Reservierungs-ID, Zahlungsart (`online` | `invoice`), optional Zahlungsreferenz.
   - Prüft: Reservierung nicht abgelaufen, Verfügbarkeit nochmals.
   - Onlinezahlung: Status `confirmed`, `paid_amount = total_amount`, Bestätigungsmail.
   - Rechnung: Status `invoice_pending`, Rechnung in `invoices` mit Rechnungsnummer + Zahlungsfrist anlegen, Versand per E-Mail.
   - Fehlgeschlagene Zahlung: Reservierung bleibt bis Ablauf aktiv, Kunde kann erneut versuchen (`payment_pending`).

4. **`/get-booking-status`** (GET, optional) — Statusabfrage für die Website (Bestätigungsseite).

5. **`/get-products`** (GET) — aktive Produkte/Kurse der aktuellen Saison mit Preisen, Dauer, Preisart, Teilnehmergrenzen — ersetzt hartcodierte Preise im Frontend der Website.

## Datenbankänderungen (Migration)

- **`tickets`**: neue Spalten `reservation_expires_at` (timestamptz, null), `reservation_token` (text, für sichere Statusabfrage). Neue Statuswerte bleiben Text: `provisional`, `payment_pending`, `confirmed`, `invoice_pending`, `expired`, `cancelled` (bestehende Werte bleiben unverändert).
- **DB-Funktion `create_provisional_reservation(...)`**: transaktionale Prüfung + Insert (Advisory Lock pro Lehrer/Zeitfenster), Ablaufzeit setzen.
- **DB-Funktion `expire_reservations()`**: setzt abgelaufene `provisional`/`payment_pending`-Tickets auf `expired` und gibt Lehrer frei — per pg_cron alle Minute.
- **`customers`**: neue Spalte `customer_number` (z. B. `KD-000001`) mit Trigger-Generator analog Rechnungsnummer; Backfill für bestehende Kunden. Interne UUID bleibt Primärschlüssel.
- Alle neuen Felder mit GRANTs/RLS-Prüfung; keine destruktiven Änderungen.

## Yeti-Admin (Frontend)

- `BookingSourceBadge` um Status-Anzeige ergänzen: provisorische Reservierungen (gelb, mit Countdown bis Ablauf), `invoice_pending`, `expired` klar unterscheidbar in `BookingsTable` und `BookingDetail`.
- Kundennummer in Kundendetail, Buchungsbestätigung und Rechnung anzeigen.

## Zahlung

- Onlinezahlung: Stripe-Integration in Yeti (Website ruft nur Yeti-Endpunkte; Stripe-Secret bleibt serverseitig). Zahlungsbestätigung via Webhook → `/confirm-booking`-Logik.
- Alternativ (einfacher Start): Website nutzt eigenen Stripe-Checkout und meldet Erfolg an `/confirm-booking` mit signierter Referenz. Entscheidung im Review.

## Testplan

- Parallele Reservierung desselben Slots (zwei gleichzeitige Requests → genau einer gewinnt).
- Ablauf: Reservierung nach 15 Min ohne Zahlung auf `expired`, Slot wieder frei.
- Rechnungspfad: Rechnungsnummer, Frist, Status `invoice_open`, nicht „bezahlt".
- Kursregeln: Gruppenkurs nur Mo–Fr, Samstagskurs nur Samstag, Manipulation der Payload serverseitig abgelehnt.
- Bestehende Buchungen/Kunden bleiben unverändert (Backfill-Test).

## Reihenfolge

1. Migration (Status, Kundennummer, Reservierungsfelder, Lock-Funktion, Cron).
2. `/get-availability` + `/get-products`.
3. `/create-reservation` + Ablauf-Cron.
4. `/confirm-booking` (Rechnung zuerst, Stripe danach).
5. Admin-UI-Anpassungen + Tests.
