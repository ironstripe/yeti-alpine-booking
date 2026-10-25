# Tarifkorrektur 14–16 = CHF 170 (2026-10-25) – vorbereitetes Paket

Quelle: ivo-brain DECISIONS "2026-10-25 – Tarifkorrektur durch Ivo: Privat-Doppelstunde 14–16 = CHF 170"
("Die Doppelstunde von 14-16 Uhr kostet effektiv nur 170.– mein Fehler"). Ersetzt alle früheren 190-Erwartungen
für 14–16. Unverändert: 10–12 = 190, 12–14 = 150, Einzelstunden 75 (Büro 85), Ausnahmen 160, Zusatzperson 20/40,
Rabatt 10 % ab 240 Min. pro Person/Tag.

**Status: vorbereitet und lokal getestet. Nichts gehostet ausgeführt, nichts deployt/publiziert.**

## Live-Vorzustand (read-only, 2026-10-25 22:3x UTC)
| Produkt | Tarif-Revision | 14–16 Regel-ID (vorher) | Preis | Zusatz | Anzeige-Rev. | Rabatt-Rev. |
|---|---|---|---|---|---|---|
| Ski 3646f155-8a66-53e3-b512-749f3a42c1ae | 1 | 45b0102a-c285-4a13-a2e9-5bd2b1e9aadf | 190 | 40 | 1 | 1 |
| Snowboard 0e8e8669-d8f4-5b19-8e6d-36ff588fdee1 | 1 | d6deec82-7fec-4b30-9ee3-522c5412ca96 | 190 | 40 | 1 | 1 |

## Paket
- Installer: `supabase/pending/private_tariff_1416_170_correction.sql` (Datenschritt, keine Migration).
  Prüft pro Produkt Revision = 1 und exakt die neun geprüften Regeln (Before-Image), übernimmt acht Regeln
  unverändert, setzt nur exact_block 14:00–16:00 auf 170 (Zusatz 40), speichert über die kanonische
  `save_product_private_tariff_rules(product, 1, …)` → Revision 2. Postflight: `pa_product_quote` 14–16 = 170,
  10–12 = 190. Akteur NULL wie bei 0028 (Installer-Lauf), Provenienz nennt Entscheid und Quelle.
- Regel-IDs: der Save ersetzt die Regelzeilen; **alle neun IDs je Produkt ändern sich** (nach dem Lauf read-only erfassen).
- Rollback: `supabase/rollback/private_tariff_1416_170_correction_rollback.sql -v expected_revision=2` (wieder 190, Revision 3).
- Ungültig werdende Quotes: jede auf Revision 1 bestätigte Quote/Edit-Bestätigung wird von `pa_create_booking`,
  `b07a_office_multi` und L1-Requote mit `quote_changed` abgelehnt (bestehende Semantik). Offene Wizard-Sitzungen
  müssen neu quoten.
- Öffentliche Projektion (Migration 0033 + Anzeige-Datenschritt, weiterhin separat geplant) liest denselben
  Resolver → 14–16 erscheint als 170; sechs Fenster unverändert. Kein Override, keine Client-Konstante. Onepager
  3d35b1 ist datengetrieben, keine Onepager-Änderung.
- Nicht berührt: gespeicherte `private_appointment_pricing`, ticket_items, Rechnungen, Zahlungen, Delivery-Payloads,
  BC-Quellen, Legacy-Matrix/`private_lesson_rates`, Rabattregel, Anzeige-Metadaten, products.

## Historische Evidenz
Bisherige 190-Werte für 14–16 (z. B. T-2026-998117/998118, Releasebericht B01–B11, `publicPrivatePricesR1`-Tests
auf Revision 1, früheres R1-S2c-Prompt) sind Vor-Korrektur-Stand und bleiben unverändert. S2c ist nun als
Server-Parität spezifiziert (10–12 = 190, 14–16 = 170), nicht als pauschal 190.

## Lokale Tests
- `node tests/privateTariff1416Correction.integration.mjs` – 9/9: Vorzustand 190; Before-Image-Abweichung blockiert
  ohne Änderung; beide Produkte Rev 2 mit 14–16 = 170, übrige Fenster/Zusatzpersonen gleich (2 Pers. 210/230);
  Regel-IDs wechseln; Anzeige/Rabatt/products/Historie unverändert; Rev-1-Bestätigung → `quote_changed`;
  kein zweiter Lauf; öffentliche Projektion sechs Fenster mit 170; Rollback → 190.
  Kette: Baseline + 0000–0027 + R1-SQL + public_private_tariff_projection (gleiche Kette wie publicPrivatePricesR1).
- `bun test tests/r1StepOneQuote.test.tsx` – 6/6 (Server-Parität 10–12 = 190, 14–16 = 170).

## Reihenfolge für den späteren geprüften Rollout
1. Read-only: Revision beider Produkte = 1, neun Regeln wie oben, keine offene Office-Buchung in Bearbeitung.
2. Installer ausführen (eine Transaktion; scheitert ohne Änderung bei Abweichung).
3. Read-only: Revision 2, neue Regel-IDs, `pa_product_quote` 14–16 = 170 / 10–12 = 190 beide Sportarten,
   Buchungs-/Rechnungs-/Zahlungs-Digests unverändert.
4. Danach wie geplant: 0030–0033, Edge-Deploys, Anzeige-Datenschritt (dann 170 öffentlich).
   Reihenfolge 2 vor/nach 0030–0033 ist unabhängig; vor dem Anzeige-Datenschritt ausführen, damit nie 190 öffentlich erscheint.
Keine Edge-Funktion muss für diese Korrektur deployt werden.
