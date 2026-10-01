# Security Gate A (rev. 2) – Lehrpersonen-Daten vor dem Booking-Corner-Import absichern

Baseline HEAD `bba0dcf`. Kein Import/Apply, kein Publish, keine Änderung an bestehenden Lehrpersonen-Zeilen oder Website-Flags, keine Rollenvergabe, kein UI-Redesign. Backup-/Snapshot-Gate und die vier Identitätsprüfungen bleiben eigene spätere Schritte.

## 1. Live-Befund (DB-Introspektion 10:3x UTC)

- `instructors`: 4 Policies `USING/WITH CHECK true` für `authenticated` (SELECT/INSERT/UPDATE/DELETE); ACL `authenticated=arwdDxtm`; anon keine Rechte. **Kritisch**: jede Lehrperson liest Kontakt, Adresse, Geburtsdatum, Lohn, Bank, IBAN, AHV, Notizen aller und kann fremde Profile ändern/löschen.
- Realtime: `instructors` in `supabase_realtime`, REPLICA IDENTITY FULL → volle Zeilen an jeden Eingeloggten.
- `get_instructor_for_user` verknüpft Login↔Lehrperson **nur über E-Mail**, und Lehrpersonen dürfen heute ihre E-Mail selbst ändern → Identitätsübernahme möglich.
- `is_admin_or_office` kennt `super_admin` nicht.
- Bucket `instructor-avatars` (öffentlich): jeder Eingeloggte darf hochladen/überschreiben/löschen.
- In Ordnung: HR-/Import-Tabellen (super_admin bzw. Staff-Lesen, keine Client-Schreibrechte), Staging ohne Client-Grants, `instructor-hr-photos`/`instructor-import-sources` privat, `instructor_test_tokens` RLS ohne Policy, Public Team API serverseitig.

## 2. Datenklassen und wer sie sieht

| Klasse | Spalten | Teacher | Office/Admin | super_admin |
|---|---|---|---|---|
| Verzeichnis | id, first_name, last_name, level, specialization, status, real_time_status, languages, role, roles, instructor_type, gender, avatar_url, show_on_website, website_teaser, created_at | alle | alle | alle |
| Betrieb/Personal (Owner-Entscheid 01.10. 12:43) | email, phone, street, zip, city, country, birth_date, entry_date, notes | nur eigene (ohne notes) | alle, lesen + bearbeiten | alle |
| Lohn/Bank | hourly_rate, bank_name, iban, ahv_number (Spalten auf `instructors`) + Rohwerte in `instructor_hr_private` | **nein** (auch nicht eigene) | **nein** | lesen + bearbeiten |

Sichtbare Folge im Büro: „Lehrperson bearbeiten“, Profilkarte und Neu-Anlage zeigen Office/Admin weiterhin Kontakt, Adresse, Geburtsdatum, Eintritt und Notizen. Nur der Block Lohn/Bank/AHV wird für Nicht-super_admin ausgeblendet (kein Layoutumbau). Formularvalidierung: `hourly_rate` ist für niemanden Pflicht (Spalte ist bereits nullable) und wird für Office/Admin weder validiert noch mitgesendet – keine versteckte Pflichtfeldsperre. `useReportsData`-Lohnkosten nur für super_admin; für Office erscheint der Bericht ohne Lohnspalte.

Lehrpersonen-Portal (Teacher): braucht weiterhin Stundenplan aller Lehrpersonen und Buchungen mit Teilnehmernamen/Niveau, Datum/Zeit und Büro-Notizen, **ohne** Kundenkontakte und Preise. Gate A ändert dafür nur `instructors`; die Teacher-Sicht auf `customers`/`tickets`/`ticket_items` (Kontakt- und Preisfelder) wird im Inventar live geprüft und negativ getestet. Zeigt sich dort eine Lücke, wird sie als eigener Folgeschritt A2 mit eigener Freigabe vorgeschlagen, nicht in Gate A mitgezogen.

## 3. Lösung (serverseitig erzwungen)

**A. Spaltenrechte auf der Tabelle**
- `REVOKE ALL ON instructors FROM authenticated`; dann `GRANT SELECT (<Verzeichnis-Spalten>)` an authenticated. Kein direktes INSERT/UPDATE/DELETE mehr aus dem Browser. Gesperrte Spalten sind damit über REST, eingebettete Joins (`instructor:instructors(email)` → Fehler), CSV-Exporte aus dem Client und `select('*')` für jede Rolle nicht lesbar.
- RLS-SELECT bleibt `true` für authenticated (Zeilen = Verzeichnis); Schreib-Policies entfallen, weil Schreiben nur über Funktionen läuft.

**B. Getrennte Serverfunktionen (SECURITY DEFINER, `REVOKE … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`, Rollenprüfung im Rumpf)**
- `instructors_ops_list(p_id uuid default null)` → explizit: Verzeichnis + email, phone, street, zip, city, country, birth_date, entry_date, notes. **Ohne** hourly_rate, bank_name, iban, ahv_number. Erlaubt: office, admin, super_admin.
- `instructors_pay_get(p_id uuid)` / `instructors_pay_list()` → nur id + hourly_rate, bank_name, iban, ahv_number (+ bestehender super_admin-Lesezugriff auf `instructor_hr_private`). Erlaubt: nur super_admin.
- `instructor_self()` → eigene Zeile: Verzeichnis + Kontakt/Adresse/Geburtsdatum/Eintritt, ohne notes und ohne Lohn/Bank.
- `instructor_ops_upsert(p jsonb)` (office/admin/super_admin): schreibt nur die ops-Spalten oben; Lohn/Bank-Schlüssel im Payload → Fehler `forbidden_field` (nicht still ignoriert). `instructor_pay_update(p_id, p jsonb)` (nur super_admin). `instructor_delete(p_id)` (office/admin/super_admin, FK-Regeln unverändert). `instructor_self_update(p jsonb)` (Teacher: nur phone, languages; **E-Mail nicht** selbst änderbar).
- Kein Rückgabetyp `SETOF instructors`; alle Rückgaben mit expliziten Spalten.

**C. super_admin eigenständig**
- Neue Hilfsfunktion `is_staff(uid)` = admin/office/super_admin; nur in den neuen Funktionen/Policies benutzt. `is_admin_or_office` selbst bleibt unverändert (keine stille Ausweitung auf alle anderen Tabellen).
- Prüfen und ggf. ergänzen, dass `instructor-import-preview/-apply`, `instructor-photo-url/-upload` `requireRole([... 'super_admin'])` akzeptieren und dass die Lehrpersonen-Seiten im Frontend super_admin als Staff behandeln (nur Zugriffsprüfung, keine Rollenumschaltung neu).

**D. Stabile Login↔Lehrperson-Zuordnung**
- Neue Tabelle `instructor_user_links(user_id uuid PK, instructor_id uuid UNIQUE, created_by, created_at)`, Lesen eigene Zeile + Staff, Schreiben nur service_role/Staff-Funktion. Keine Änderung an `instructors`-Zeilen.
- Einmalige Befüllung aus heutigen **eindeutigen** E-Mail-Treffern (Mehrdeutige werden nicht verknüpft, nur gemeldet); vorher Trockenlauf mit Anzahl.
- `get_instructor_for_user` liest zuerst den Link; E-Mail-Fallback nur, wenn kein Link existiert **und** genau ein Treffer. `link-instructor-to-user`/`invite-instructor` schreiben künftig den Link. E-Mail-Änderungen nur durch Staff.

**E. Realtime ohne PII, Pulse bleibt**
- `instructors` aus `supabase_realtime` entfernen, REPLICA IDENTITY DEFAULT.
- Neue Tabelle `instructor_live_status(instructor_id PK, real_time_status, updated_at)`, per Trigger aus `instructors` synchronisiert, in Realtime publiziert, REPLICA IDENTITY FULL (enthält nur diese 3 Felder), SELECT für authenticated. `useInstructors` abonniert diese Tabelle → Statusfrische und Pulse-Animation bleiben gleich. Keine Degradation erwartet; falls der Test anderes zeigt, wird es berichtet statt still auf Polling umgestellt.

**F. Öffentlicher Avatar-Bucket:** Schreiben nur `is_staff`; öffentliches Lesen bleibt; nichts kopiert oder gelöscht.

**G. Frontend:** alle Stellen, die gesperrte Spalten oder `*` lesen bzw. direkt schreiben, auf die passenden Funktionen umstellen (useInstructors, useSchedulerData, useInstructorDetail, InstructorProfile, useUpdateInstructor, useCreateInstructor, useBulkCreateInstructors, useUserRole, NewUserDialog, useSettingsUsers, search.ts, Gruppenkurs-Benachrichtigungen, BookingWizardContext, usePeriodModification, useReportsData, NewRentalDialog, LaunchChecklist u. a. – vollständige Liste per Suche). HR-Felder nur rendern, wenn super_admin.

## 4. Reihenfolge

1. Additive Migration: `is_staff`, Funktionen, `instructor_user_links` (+Grants/RLS), `instructor_live_status` + Trigger. Nichts gesperrt.
2. Trockenlauf + Befüllung der Links (eindeutige Treffer), Frontend umstellen, Build/Tests, Büro-Smoke.
3. Sperr-Migration: Revoke/Column-Grants, Policies, Realtime, Avatar-Bucket.
4. Alle Tests wiederholen inkl. echter Teacher-Login.

Jede Migration wird dir vorher im Freigabe-Dialog gezeigt.

## 5. Rollback (Datei `supabase/rollback/gate_a_instructors_rollback.sql`, wird **nicht** ausgeführt)

Kopfzeile: „NUR NOTFALL – stellt den unsicheren Vorzustand wieder her; normale Behebung = Vorwärts-Fix.“ Inhalt stellt exakt den introspektierten Zustand her:
- `GRANT ALL ON public.instructors TO authenticated` (= `arwdDxtm`), Spalten-Grants entfernen.
- Die 4 Original-Policies mit exakt Namen/Rollen/Ausdrücken (`true`) neu anlegen, neue Policies löschen.
- `REPLICA IDENTITY FULL`, `ALTER PUBLICATION supabase_realtime ADD TABLE public.instructors`.
- Die 3 Original-Avatar-Policies (Namen, `authenticated`, `bucket_id = 'instructor-avatars'`) wiederherstellen.
- `get_instructor_for_user` auf die heutige E-Mail-Definition zurück.
- Neue Funktionen/Tabellen bleiben (additiv, harmlos), damit das neue Frontend weiterläuft.
Vor Schritt 3 wird der Rollback in einer Transaktion mit `ROLLBACK` probehalber ausgeführt und das Ergebnis (ACL/Policies identisch zum Befund) verglichen.

## 6. Tests

**SQL-Rollentest** `supabase/tests/gate_a_instructors_rls_test.sql`, `psql "$PRIVILEGED_DB_URL" -v ON_ERROR_STOP=1 -f …`, alles in einer Transaktion mit ROLLBACK; Wegwerf-Auth-User/Rollen nur innerhalb der Transaktion, per `set local role authenticated` + `request.jwt.claims`.
- Teacher: `SELECT *` und jede gesperrte Spalte → permission denied; eingebetteter Join auf email/iban → denied; Verzeichnis aller → ok; `instructors_ops_list`/`hr_*` → forbidden; `instructor_self` → nur eigene, ohne Lohn/Bank/notes; direktes UPDATE/DELETE/INSERT → denied; `instructor_self_update` mit email/hourly_rate/status → abgelehnt, mit phone → ok; fremde ID nicht erreichbar; E-Mail-Spoof (fremde E-Mail gesetzt) verschiebt Zuordnung nicht; HR/Staging/Runs/Links/Fotos-Metadaten → 0/denied; `storage.objects` in `instructor-hr-photos` → 0; Avatar-Upload → denied.
- Office/Admin: ops_list liefert und ops_upsert ändert email, phone, street, zip, city, country, birth_date, entry_date, notes → ok; hourly_rate/bank_name/iban/ahv_number weder direkt (REST, Join, `*`) noch über ops_list, `pay_*` → forbidden, ops_upsert mit Lohnfeld → `forbidden_field`; `instructor_hr_private` → 0 Zeilen; Anlage ohne hourly_rate gelingt; delete ok.
- super_admin **ohne** admin/office: ops_list + ops_upsert + pay_get/pay_update + `instructor_hr_private` + Import-Tabellen ok.
- Teacher-Portal: Buchungen aller Lehrpersonen mit Teilnehmernamen/Niveau, Datum/Zeit, Büro-Notizen lesbar; Kundenkontakt- (E-Mail/Telefon/Adresse) und Preisfelder in `customers`/`tickets`/`ticket_items` werden negativ geprüft – Ergebnis wird berichtet (Lücke → Folgeschritt A2).
- Anon: alles verweigert.
- Realtime: `instructors` nicht in Publikation; `instructor_live_status` hat genau 3 Spalten.
- Unveränderung: Hash über alle `instructors`-Zeilen (heute 31) und Liste `show_on_website=true` vor/nach identisch.

**Public Team API:** vor und nach Deployment echter Aufruf; Anzahl vorher = nachher (gemessen, nicht fest kodiert) und Feldschlüssel jedes Eintrags ⊆ erlaubter öffentlicher Satz (keine email/phone/birth_date/hourly_rate/iban/…).

**Edge-Functions:** Import-Preview/-Apply/Photo-URL mit super_admin-only-Token positiv, Teacher/Office negativ (soweit Token verfügbar).

**Browser (Playwright):** Büro: Liste, Detail, Bearbeiten, Scheduler; super_admin: Import-Vorschau; Teacher: Stundenplan aller Lehrpersonen, eigenes Profil, Realtime-Mitschnitt ohne PII.

Build + bestehende Tests.

## Offene Gates (werden gemeldet, nicht behauptet)
- Echter Teacher-Login nach Deploy: braucht ein bestehendes Teacher-Konto und deine Freigabe zum Anmelden des Testbrowsers. Ohne das bleibt der Browser-/Realtime-Teil als Teacher **ungeprüft**; Gate A gilt dann nicht als bestanden.
- Entscheidung Büro-Sicht auf Adresse/Geburtsdatum/Notizen (Abschnitt 2).
- Backup/Snapshot vor dem Import bleibt eigenes Gate.
- Übrige Scanner-Funde außerhalb des Imports bleiben unberührt.
