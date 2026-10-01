# Security Gate A – Lehrpersonen-Daten vor dem Booking-Corner-Import absichern

Baseline HEAD `bba0dcf`. Kein Import, kein Publish, keine Datenänderung an Lehrpersonen, keine Rollenvergabe, kein UI-Redesign.

## 1. Live-Inventar (geprüft per DB-Introspektion, nicht aus Git)

| Objekt | Live-Zustand | Risiko |
|---|---|---|
| `instructors` RLS-Policies | SELECT/INSERT/UPDATE/DELETE für `authenticated` mit `true` | **Kritisch**: jede Lehrperson liest E-Mail, Telefon, Adresse, Geburtsdatum, Lohn, Bank, IBAN, AHV, Notizen aller anderen und kann fremde Profile ändern/löschen |
| `instructors` Grants | `authenticated`: volle Tabellenrechte inkl. Spalte `iban`; `anon`: keine | wie oben |
| Realtime | `instructors` in `supabase_realtime`, REPLICA IDENTITY **FULL** | Realtime liefert jedem Eingeloggten ganze Zeilen inkl. PII (neu + alt) |
| `instructor_hr_private`, `_source_links`, `_import_runs` | SELECT nur `is_super_admin` | ok |
| `instructor_import_staging` | keine Client-Grants, RLS ohne Policy | ok |
| `instructor_deployment_windows`, `instructor_photos` | SELECT nur office/admin/super_admin | ok |
| Bucket `instructor-hr-photos` (privat) | Lesen nur office/admin/super_admin; kein Client-Schreiben | ok |
| Bucket `instructor-import-sources` (privat) | keine Policies (nur Server) | ok |
| Bucket `instructor-avatars` (öffentlich) | **jeder Eingeloggte** darf hochladen/überschreiben/löschen | Importrelevant: Lehrperson kann fremde öffentliche Porträts ersetzen |
| `instructor_test_tokens` | RLS an, keine Policy | ok (verweigert) |
| Public Team API `get-public-instructors` | Server, nur aktiv + `show_on_website` | ok, bleibt unverändert |

Teacher-Konsumenten, die fremde Lehrpersonen brauchen: nur Namen/IDs (InstructorSchedule, Live-Planung, Transfers, eingebettete `instructor:instructors(first_name,last_name)` in ca. 16 Abfragen). Eigenes Profil: `InstructorProfile` liest `*` und ändert `phone, email, languages`.

## 2. Lösung (serverseitig erzwungen)

**Spaltenrechte statt Vertrauen ins Frontend:**
- Tabellen-SELECT auf `instructors` für `authenticated` entziehen; nur unkritische Spalten wieder freigeben: `id, created_at, first_name, last_name, level, specialization, status, real_time_status, languages, role, roles, instructor_type, gender, avatar_url, show_on_website, website_teaser`.
- Gesperrt für direkte Client-Abfragen (alle Rollen): `email, phone, birth_date, street, zip, city, country, hourly_rate, bank_name, iban, ahv_number, notes, entry_date`.
- Eingebettete Namens-Joins und der Teacher-Stundenplan funktionieren unverändert weiter.

**Volle Daten nur über geprüfte Serverfunktionen (SECURITY DEFINER):**
- `instructors_staff_list(p_id uuid default null)` → volle Zeilen, nur office/admin/super_admin, sonst Fehler `forbidden`.
- `instructor_self()` → nur die eigene Zeile (Zuordnung über Login-E-Mail wie heute in `useUserRole`), ohne Lohn/Bank/IBAN/AHV/Notizen.

**Schreibrechte:**
- INSERT/DELETE: nur office/admin (RLS).
- UPDATE: office/admin alles; Lehrperson nur eigene Zeile, und ein Trigger lehnt jede Änderung außer `phone, email, languages` ab (inkl. Status, Rolle, Lohn, `show_on_website`).

**Realtime:** Weil Realtime Spaltenrechte nicht zuverlässig filtert, wird `instructors` aus der Realtime-Publikation genommen und REPLICA IDENTITY auf DEFAULT gesetzt. Die Büro-Liste aktualisiert sich danach per Neuladen alle 30 s statt per Push (Pulse-Animation entfällt; sonst keine sichtbare Änderung).

**Öffentlicher Avatar-Bucket:** Hochladen/Ändern/Löschen nur noch office/admin; öffentliches Lesen bleibt (bestehende Bilder unverändert, nichts kopiert).

**Frontend-Anpassung (kein Layoutwechsel):** Alle Abfragen, die gesperrte Spalten oder `*` lesen, auf die Serverfunktionen umstellen: `useInstructors`, `useSchedulerData`, `useInstructorDetail`, `InstructorProfile`, `useUpdateInstructor` (kein `.select()` nach Update), `useUserRole`, `NewUserDialog`, `useSettingsUsers`, `search.ts`, Gruppenkurs-Benachrichtigungen, `BookingWizardContext`, `usePeriodModification`, `useReportsData`, `useBulkCreateInstructors` u. a. – vollständige Liste per Suche, jede Stelle einzeln.

Edge Functions laufen mit Service-Role und sind nicht betroffen.

## 3. Migration (zur Prüfung – wird erst nach Freigabe ausgeführt)

```sql
-- Policies
DROP POLICY "Authenticated users can view all instructors" ON public.instructors;
DROP POLICY "Authenticated users can insert instructors" ON public.instructors;
DROP POLICY "Authenticated users can update instructors" ON public.instructors;
DROP POLICY "Authenticated users can delete instructors" ON public.instructors;
CREATE POLICY ins_select_auth ON public.instructors FOR SELECT TO authenticated USING (true); -- Zeilen sichtbar, Spalten per Grant begrenzt
CREATE POLICY ins_insert_staff ON public.instructors FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_office(auth.uid()));
CREATE POLICY ins_delete_staff ON public.instructors FOR DELETE TO authenticated USING (public.is_admin_or_office(auth.uid()));
CREATE POLICY ins_update_staff_or_self ON public.instructors FOR UPDATE TO authenticated
  USING (public.is_admin_or_office(auth.uid()) OR id = public.get_instructor_for_user(auth.uid()))
  WITH CHECK (public.is_admin_or_office(auth.uid()) OR id = public.get_instructor_for_user(auth.uid()));

-- Spaltenrechte
REVOKE SELECT ON public.instructors FROM authenticated;
GRANT SELECT (id, created_at, first_name, last_name, level, specialization, status, real_time_status,
  languages, role, roles, instructor_type, gender, avatar_url, show_on_website, website_teaser)
  ON public.instructors TO authenticated;
-- INSERT/UPDATE/DELETE-Grants bleiben; RLS + Trigger begrenzen sie.

-- Self-Edit-Guard
CREATE FUNCTION public.instructors_self_edit_guard() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin_or_office(auth.uid()) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - 'phone' - 'email' - 'languages') <> (to_jsonb(OLD) - 'phone' - 'email' - 'languages')
  THEN RAISE EXCEPTION 'forbidden_column_change'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_instructors_self_edit_guard BEFORE UPDATE ON public.instructors
  FOR EACH ROW EXECUTE FUNCTION public.instructors_self_edit_guard();

-- Staff-Volldaten / eigene Zeile
CREATE FUNCTION public.instructors_staff_list(p_id uuid DEFAULT NULL) RETURNS SETOF public.instructors
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_admin_or_office(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM public.instructors WHERE p_id IS NULL OR id = p_id ORDER BY last_name;
END $$;
CREATE FUNCTION public.instructor_self() RETURNS TABLE(id uuid, first_name text, last_name text, email text,
  phone text, languages text[], specialization text, level text, status text, avatar_url text, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.first_name, i.last_name, i.email, i.phone, i.languages, i.specialization, i.level,
         i.status, i.avatar_url, i.roles
  FROM public.instructors i WHERE i.id = public.get_instructor_for_user(auth.uid())
$$;  -- exakte Spaltentypen werden vor Ausführung an das Live-Schema angepasst
REVOKE EXECUTE ON FUNCTION public.instructors_staff_list(uuid), public.instructor_self() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructors_staff_list(uuid), public.instructor_self() TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime DROP TABLE public.instructors;
ALTER TABLE public.instructors REPLICA IDENTITY DEFAULT;

-- Öffentlicher Avatar-Bucket: Schreiben nur Staff
DROP POLICY "Authenticated users can upload instructor avatars" ON storage.objects;
DROP POLICY "Authenticated users can update instructor avatars" ON storage.objects;
DROP POLICY "Authenticated users can delete instructor avatars" ON storage.objects;
CREATE POLICY avatars_staff_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'instructor-avatars' AND public.is_admin_or_office(auth.uid()));
CREATE POLICY avatars_staff_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'instructor-avatars' AND public.is_admin_or_office(auth.uid()));
CREATE POLICY avatars_staff_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'instructor-avatars' AND public.is_admin_or_office(auth.uid()));
```

Reihenfolge: (a) Frontend auf Serverfunktionen umstellen – Funktionen zuerst in eigener additiver Migration anlegen; (b) Smoke-Test; (c) dann die Sperr-Migration oben; (d) Tests wiederholen. Damit bricht das Büro nie zwischendurch.

## 4. Rollback (als `supabase/rollback/gate_a_instructors_rollback.sql`)

```sql
DROP TRIGGER IF EXISTS trg_instructors_self_edit_guard ON public.instructors;
DROP FUNCTION IF EXISTS public.instructors_self_edit_guard();
DROP POLICY IF EXISTS ins_select_auth ON public.instructors;
DROP POLICY IF EXISTS ins_insert_staff ON public.instructors;
DROP POLICY IF EXISTS ins_delete_staff ON public.instructors;
DROP POLICY IF EXISTS ins_update_staff_or_self ON public.instructors;
GRANT SELECT ON public.instructors TO authenticated;
CREATE POLICY "Authenticated users can view all instructors" ON public.instructors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert instructors" ON public.instructors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update instructors" ON public.instructors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete instructors" ON public.instructors FOR DELETE TO authenticated USING (true);
ALTER TABLE public.instructors REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instructors;
-- Avatar-Bucket-Policies analog wiederherstellen; RPCs bleiben (harmlos, frontend-kompatibel).
```
Hinweis: Rollback stellt den unsicheren Zustand wieder her – nur im Notfall.

## 5. Tests

SQL-Rollentest `supabase/tests/gate_a_instructors_rls_test.sql` (in Transaktion, ROLLBACK, simuliert `request.jwt.claims` je Rolle mit Wegwerf-Usern innerhalb der Transaktion – keine echten Rollenzuweisungen bleiben bestehen):
- Teacher: `SELECT *` → permission denied; `SELECT iban/email/birth_date …` → denied; Namen aller Lehrpersonen → ok; `instructors_staff_list()` → forbidden; `instructor_self()` → nur eigene Zeile; fremdes UPDATE/DELETE → 0 Zeilen; eigenes UPDATE `phone` ok, eigenes UPDATE `hourly_rate`/`show_on_website` → `forbidden_column_change`; HR/Staging/Runs/Links → 0 Zeilen bzw. denied; `instructor-hr-photos` → 0 Objekte; Avatar-Upload → verweigert.
- Office/Admin: `instructors_staff_list()` voll, INSERT/UPDATE/DELETE ok.
- Super-Admin: Runs/HR lesbar.
- Anon: alles verweigert.
- Realtime: Publikation enthält `instructors` nicht mehr.
- Public Team API per curl: nur aktive, freigegebene; Anzahl unverändert (heute 2).
- Kontrolle: Prüfsumme aller 31 Lehrpersonen-Zeilen und `show_on_website` vor/nach identisch.

Build + bestehende Tests + Playwright-Smoke (Büro: Lehrpersonenliste, Detail, Scheduler).

## Offene Gates (werden gemeldet, nicht behauptet)
- Echter Teacher-Login-Test im Browser braucht ein Teacher-Testkonto bzw. deine Freigabe zum Anmelden – ohne das bleibt der Browser-Teil „nicht geprüft“ (SQL-Rollentest deckt die DB-Seite ab).
- Echter Realtime-Payload-Mitschnitt als Teacher: gleiches Gate.
- Übrige ~40 Scanner-Funde außerhalb des Imports bleiben unberührt.
