# B07a – atomare Mehrpositions-Buchung: Stand und Blocker

Base SHA: `cf48e83` (HEAD bei Start). Final: siehe Commit dieser Änderung.
Status: **nur Grundlage umgesetzt, B07a NICHT vollständig.** Keine SQL-Datei, keine Migration, kein Deploy, keine Live-Writes, keine Mails.

## Geänderte Dateien
- `src/lib/multiItemBookingPlan.ts` (neu, rein, nirgends eingebunden): klassifiziert einen Warenkorb fail-closed; ordnet Entwurfspersonen positionsübergreifend einmal zu; erkennt Überschneidung derselben Person (angrenzend erlaubt, andere Personen parallel erlaubt); markiert >=4h gleiche Person/gleicher Tag als `discount_decision_required`; stabiler Payload-Fingerprint für Idempotenz.
- `tests/multiItemBookingPlan.test.ts` (neu): 5 Tests / 13 Assertions, bestanden (`bun test ./tests/multiItemBookingPlan.test.ts`).
- UI-Sperre `multiItemBlocked` und alle Einzelpositions-Aufrufer unverändert.

## Warum die Server-Transaktion gestoppt wurde (read-only belegt)
1. **Privatpreis-Quelle widerspricht "Preise wie in den Produkten":** Kanonisches `pa_create_booking` rechnet über `pa_price` = globale `private_lesson_rates` (09–10 75, 10–12 85, 12–14 75, 14–16 85, +20/Person/h, max 4 Personen), nicht produktspezifisch. Aktive Privatprodukte haben keine Stufen (`product_price_tiers` 0) und Preise `Private Lektion Ski 2h` = 0, `Privatstunde 75` = 75, `Privatstunde 85` = 85, `Schulatrif` = 60; Tabelle `product_private_tariffs` existiert live nicht; die BC-Tarifquellen (35) hängen nur an inaktiven Produkten.
   Beispiel: "Private Lektion Ski 2h", 10–12, 1 Person: `pa_price` = 170 CHF, Produktpreis = 0 CHF. "Produktpreis übernehmen" würde hier also gegenüber dem heutigen Einzelpfad umpreisen.
2. **10%-Regel ist nirgends automatisch umgesetzt** (nur manueller `discount_percent`), wird aber erst bei Mehrpositionen erreichbar. Beispiel: Anna Ski 09–11 + Snowboard 14–16 am 2.1. = 4h → 10%. Anna und Ben teilen 10–14 (2 Personen, 340 CHF): Aufteilung des Rabatts auf Grundpreis/Zuschlag laut Memory ausdrücklich "nicht entschieden".

## Benötigte Entscheide (Ivo)
- E1: Für Privatlektionen gilt weiter `private_lesson_rates`/`pa_price` (= heutiger Einzelpfad) **oder** ein noch zu pflegender Produkttarif? Bei letzterem: welche Werte für "Private Lektion Ski/Snowboard 2h"?
- E2: Soll die 10%-Regel in B07 automatisch gerechnet werden? Wenn ja: geteilte Lektion → 10% auf die ganze Zeile nur, wenn *alle* Teilnehmer ≥4h haben, oder anders? Verhältnis zu manuellem Rabatt (ersetzt/kombiniert/gesperrt)?
- Bis dahin blockt `classifyMultiItemCart` solche Fälle explizit statt zu raten.

## Geplante B07a-Serverarbeit nach Entscheid (unverändert aus Plan)
Pending SQL ohne Nummer `supabase/pending/b07_office_multi_create.sql`: `pa_create_booking_core`/`bc_2627_staff_group_book_core` auf vorgegebenem Ticket (bestehende Signaturen als Hüllen), `b07_office_submissions(submission_key, payload_digest, ticket_id)` mit Advisory-Lock, Slots/Kurse in fester ID-Reihenfolge sperren, ein Ticket/`staff_booking_finalize`/B05-Intent, keine Provider-Aufrufe. Neue Staff-Funktion `office-booking` (`requireRole(["admin","office"])`).
Tests lokal auf `tests/sql/production_schema_baseline.sql`: Fehler Pos. 2/3 → nichts gespeichert; Replay/Parallel; geänderter Payload gleicher Key → Ablehnung; fremde Teilnehmer; Trigger/Grants.

## Rückbau
Nur zwei neue, nicht eingebundene Dateien: löschen genügt. Keine Daten betroffen.

## B07b / Retests
B07b (UI) erst nach B07a. Retests HB023/041/045/047–049/052/053/055/078 offen. B02 hosted Retest weiterhin nicht abgenommen; B04/B05/B06 nicht installiert.
