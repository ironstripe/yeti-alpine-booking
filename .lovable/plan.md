# Produkt löschen – Release-Abgleich (kein neues Design)

## Live-Stand heute (gelesen 18.10.)
- BACKEND DB: `public.product_delete(uuid,uuid)` ist **bereits installiert** (Migration `0014_product_delete`, identisch mit `supabase/pending/product_delete.sql`). `product_lifecycle` fehlt (gewollt). `authenticated` darf die Funktion nicht ausführen (gut). `is_admin_or_office`, `is_super_admin` vorhanden. 32 Produkte, 54 Tarifstufen.
- Damit ist Punkt 2 der Zweitprüfung (SQL nicht installiert) überholt. Offen: ob die live laufende `product-management` den neuen Request `{action:'delete', product_id}` annimmt, und dass das veröffentlichte Office-Frontend noch den alten Code hat.

## Schritte

1. Preflight (nur lesen, BACKEND)
   - Spalten und FKs der 8 Abhängigkeits-Tabellen + `pricing_rules.applies_to_products` gegen die Abfragen in `0014_product_delete.sql` prüfen.
   - Für alle 32 Produkte als Testlauf zählen, was die Funktion als Abhängigkeit melden würde (reines SELECT). Erwartung: BC-importierte Produkte und solche mit Kursen/Buchungen gelten als „in Gebrauch“.
   - Abbruch, falls eine Spalte oder Tabelle fehlt; dann nur diese Abfrage korrigieren.

2. Datenbank: keine neue Migration, außer Schritt 1 findet einen Fehler. Dann eine einzelne, verfolgte Ersatz-Migration nur für `product_delete`.

3. Server-Funktion (BACKEND): Nur `product-management` aus `supabase/functions/product-management/index.ts` neu deployen. Vorher Deno-Check und `index.test.ts`. Danach live: ohne Anmeldung → 401; ungültiger Body → 400; keine anderen Funktionen.

4. Frontend (CODE → PUBLISHED)
   - Zwischen der letzten veröffentlichten Version und HEAD prüfen, was sonst noch mitveröffentlicht würde (Preis-Editoren, Website-Angebot, Serien). Für jede Oberfläche, deren Datenbankteil fehlt, prüfen, dass sie bei fehlender Tabelle ruhig deaktiviert bleibt und nichts kaputtmacht.
   - Wenn alles verträglich ist: normales Publish nach deiner Freigabe. Wenn nicht: nur ein kleiner Schutz, der die unfertige Oberfläche ausblendet (Datei wird benannt), dann Publish. Nicht ohne deine ausdrückliche Freigabe.

5. Ende-zu-Ende-Test in der Vorschau (angemeldet als Office/Admin)
   - Ein Testprodukt „TEST Löschen“ (inaktiv, ohne Website) anlegen → Löschen → Bestätigen → nach Neuladen verschwunden, seine Tarifstufen auch.
   - BC-importiertes Produkt: Löschen → klare deutsche Meldung mit Liste, was es nutzt, Angebot „Deaktivieren“; Produkt, Preise und BC-Quelle unverändert.
   - Lehrer-Login (oder Aufruf ohne Rolle): abgelehnt (403), Fehlermeldung als Hinweis, kein leerer Bildschirm/Overlay.
   - Liste nach Neuladen in Ordnung; Anzahl Produkte/Tarife/BC-Quellen/Kurse/Buchungszeilen vorher = nachher (abgesehen vom Testprodukt).
   - Danach dieselben Prüfungen im veröffentlichten Office.

6. Rollback
   - Funktion: `supabase/rollback/product_delete_rollback.sql` (entfernt nur die Funktion).
   - Server-Funktion: vorige Version neu deployen.
   - Frontend: vorige veröffentlichte Version wiederherstellen.

## Fertig, wenn
Löschen funktioniert im veröffentlichten Office nachweislich für ein unbenutztes Produkt und wird bei benutzten Produkten verständlich blockiert. Ein grüner Build allein zählt nicht.

## Dateien
`supabase/functions/product-management/index.ts`, `src/lib/productDelete.ts`, `src/hooks/useProducts.ts`, `src/pages/SettingsProducts.tsx`, `drizzle/migrations/0014_product_delete.sql`; Tests: `tests/productDelete.test.ts`, `tests/productDelete.integration.mjs`, `supabase/functions/product-management/index.test.ts`.
