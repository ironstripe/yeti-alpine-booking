# Booking-Corner 2026/27 Lehrer-Import: Dry-Run + separater Apply (nur Admin)

Scope: nur die Import-Funktion. Kein echter Import, kein DB-Reset, keine Website-Freigabe, keine Änderung an Produkten, Rechnungen, Checkout, Buchung oder Scheduler-Optik.

## Vorab-Entscheide (Blocker)
1. **"Super-Admin" existiert nicht.** Rollen sind nur admin / office / teacher. Vorschlag: neue Rolle `super_admin` in `app_role` + Eintrag nur für den Owner (Zuweisung per Migration mit konkreter User-ID, die du nennst). Alternative: `admin` gilt als Super-Admin.
2. **Migrationen brauchen deine Freigabe** (Schritte A, C unten). Sie sind additiv; NOT NULL-Lockerung ist die einzige Schema-Lockerung.
3. **Öffentliche Avatare:** bestehende Handuploads liegen im öffentlichen Bucket `instructor-avatars`. Plan: neue Handuploads gehen in den privaten Bucket; bestehende Dateien bleiben unverändert, bis du über Migration entscheidest (`get-public-instructors` nutzt sie heute nicht für nicht-freigegebene Personen).

## Stufen
```text
A  Migration (additiv)         -> Freigabe
B  Edge Functions + UI deployen, Tests mit synthetischen Dateien
C  RLS-Verschärfung / Storage-Policies -> Freigabe
D  Dry-Run mit echten Dateien durch Owner im Browser (kein Apply)
E  Apply nur auf ausdrückliche Owner-Aktion (nicht Teil dieser Aufgabe)
```

## Datenmodell (Migration A)
- `instructors`: `email`, `phone`, `hourly_rate` nullable (keine Defaults, kein CHF 30, kein CH). Leser/Formulare zeigen „—" bzw. „nicht erfasst"; Validierung im Edit-Formular erlaubt leer.
- `instructor_source_links` (source_system, rollout, source_id) → instructor_id, unique; source_checksum, last_import_run_id. Nur super_admin.
- `instructor_import_runs`: Status (preview/applying/applied/failed), Datei-SHA-256, Zähler, Ersteller, Zeitstempel. Keine Rohdaten.
- `instructor_import_staging`: pro Run und Source-ID die normalisierte Zeile + Klassifikation + Diff (JSONB), Batch-Status. Nur service_role/super_admin; nach Apply oder 14 Tagen löschbar.
- `instructor_hr_private`: Lohntext roh, Bank, AHV, unaufgelöste Quellfelder, unbekannte Attribute (JSONB). Nur super_admin (RLS + kein anon/teacher-Grant).
- `instructor_deployment_windows`: instructor_id, valid_from, valid_until, source ('booking_corner'|'manual'), import_run_id.
- `instructor_photos`: instructor_id, storage_path (privat), origin ('booking_import'|'manual_upload'), source_sha256, width/height, is_current.
- Keine Änderung an `instructor_absences`.

## Server (Edge Functions, verify_jwt=true, requireRole super_admin)
- `instructor-import-preview`: nimmt XLSX + ZIP (multipart, Grenzen z. B. 10 MB / 60 MB), prüft 3 Blätter, nur nicht-archivierte Zeilen, 87 eindeutige BookingCorner_IDs, 3'254 Zuordnungs-Referenzen, ZIP-Pfadsicherheit (kein `..`, kein absoluter Pfad, keine Symlinks, nur JPEG per Magic Bytes), Manifest SHA-256/Grösse. Schreibt Staging + Run; Antwort nur Zähler + Klassen + Feld-Diffs (maskiert für Lohn/Bank/AHV). Logs ohne PII.
- Klassifikation: `update` (Source-Link vorhanden) · `no_op` (Checksumme gleich) · `create` · `review` (Namens-Treffer ohne starke ID; gleicher Name/andere Nummer; Schreibvarianten wie Victoria/Viktoria; YETI-only). `candidate` nur bei exaktem Namen + gleicher normalisierter Telefonnummer (+ Geburtsdatum falls vorhanden), trotzdem Bestätigung nötig. Nie Merge/Löschen/Deaktivieren automatisch.
- `instructor-import-apply`: nur für Run im Status preview, vom super_admin bestätigte Review-Entscheide, in Batches (je 20) per serverseitiger Transaktions-RPC, idempotent (Source-Link + Checksumme), fortsetzbar nach Abbruch. Neue Personen `show_on_website=false`, bestehende Flags unverändert. Fotos: EXIF-Orientierung anwenden, EXIF/GPS entfernen, Seitenverhältnis halten, nicht vergrössern; nie überschreiben, wenn aktuelles Foto `manual_upload` ist.
- Zuordnungen: nur verifizierte Semantik (Sprache, Kompetenzen, Rollen, Treffpunkte über explizite Mapping-Tabelle im Code); `Eintrag` = Laufnummer; Rest privat in `instructor_hr_private`.

## Verfügbarkeit
- Scheduler/Buchbarkeit (`check-instructor-availability`, Wizard-Lehrerliste, `pa_slot_is_free`): wenn für eine Person mindestens ein Deployment-Fenster existiert, ist sie nur innerhalb eines Fensters buchbar. Die 11 importierten ohne zukünftiges Fenster bekommen einen Marker „kein Einsatzfenster" und sind nicht buchbar. Bestehende YETI-Lehrer ohne Import bleiben wie heute (keine Regression). Vergangene Fenster geben keine Verfügbarkeit.

## UI (bestehender Import-Einstieg, kein Redesign)
- `BulkUploadModal`: neuer Tab „Booking-Corner (XLSX + ZIP)", nur für super_admin sichtbar. Vorschau-Tabelle mit Zählern (87 / 76 Fenster / 43 Fotos / 44 ohne Foto / 0 Abwesenheiten / 0 archiviert) und Liste create/update/no-op/review mit Konfidenz; Review-Entscheide pro Zeile. Button „Import ausführen" separat, mit Bestätigung. Alter CSV-Import bleibt, darf aber keine Fantasiewerte mehr setzen.
- Manueller Avatar-Upload: gleiche Bedienung, speichert privat + `manual_upload`; Anzeige via signierte URL.

## Tests
- Parser (synthetische XLSX/ZIP): Blätter, Duplikat-IDs, Zip-Slip, falscher MIME, Manifest-Mismatch, leere Felder bleiben null.
- Matching: Source-Link, Name+Telefon, Name ohne Telefon → review, YETI-only → review.
- Reimport: gleiche Dateien → 0 neue Datensätze; manuelles Foto bleibt.
- Bild: Orientierung, EXIF entfernt, keine Vergrösserung.
- Perioden: innerhalb/ausserhalb/kein Fenster.
- RLS-SQL-Test (rollback): anon/teacher/office sehen weder HR-Tabelle noch private Fotos; super_admin schon.
- Build + Typprüfung.

## Rollback
`supabase/rollback/bc_import_rollback.sql`: neue Tabellen/Bucket-Policies droppen, NOT NULL nur wiederherstellen, wenn keine NULL-Werte existieren (sonst Abbruch mit Meldung). Instructor-UUIDs und Buchungen werden vom Import nie gelöscht.

## Nicht in diesem Schritt
Echter Import, Website-Freigabe, öffentliche Foto-Derivate, Onepager.
