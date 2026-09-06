# Website-Porträt: Standard = vorhandenes Profilbild

## Ziel
Wenn für das Website-Profil kein eigenes Porträt hochgeladen wurde, wird automatisch das vorhandene Profilbild der Lehrperson (`instructors.avatar_url`, Bucket `instructor-avatars`) verwendet — in der Vorschau, bei der Veröffentlichungs-Prüfung und in der öffentlichen Schnittstelle.

## Änderungen

### 1. Website-Profil-Karte (`src/components/instructors/detail/WebsiteProfileCard.tsx`)
- Neuer Prop `avatarUrl` (von `InstructorDetail.tsx` aus dem Instructor-Datensatz).
- Effektives Bild: eigenes Website-Porträt, falls vorhanden, sonst Profilbild (`avatar_url`, Cache-Buster `?t=…` entfernt).
- Vorschau (4:5-Kasten und Website-Vorschau) zeigt das effektive Bild.
- Hinweistext unter dem Upload-Bereich: „Kein eigenes Porträt hochgeladen – das Profilbild wird verwendet." bzw. „Kein Profilbild vorhanden – bitte Porträt hochladen."
- Veröffentlichungs-Prüfung: „Portraitbild" gilt als vorhanden, wenn ein eigenes Porträt ODER ein Profilbild existiert.

### 2. Öffentliche Schnittstelle (`supabase/functions/get-public-instructors/index.ts`)
- Select erweitert um `instructors!inner(status, avatar_url)`.
- Fallback: ohne `portrait_url`/`portrait_storage_path` wird `avatar_url` (ohne `?t=`-Parameter) aus dem öffentlichen Bucket `instructor-avatars` geliefert.
- Ein Profil ohne beide Bilder wird weiterhin ausgelassen.
- Funktion neu deployen.

### 3. Verkabelung
- `src/pages/InstructorDetail.tsx`: `avatarUrl={instructor.avatar_url}` an `WebsiteProfileCard` übergeben.

## Technische Details
- Kein DB-Schema- oder RLS-Change nötig; `instructor-avatars` ist bereits öffentlich lesbar (`getPublicUrl` in `EditInstructorModal.tsx`).
- Kein Kopieren der Bilddatei: der Avatar dient nur als Fallback-URL. Ein explizit hochgeladenes Website-Porträt hat weiterhin Vorrang.

## Testanleitung
1. Lehrperson mit Profilbild, aber ohne Website-Porträt öffnen → Vorschau zeigt das Profilbild, Hinweis „Profilbild wird verwendet".
2. Veröffentlichen → funktioniert ohne eigenes Porträt; `GET /get-public-instructors` liefert `portrait_url` = Profilbild-URL.
3. Eigenes Website-Porträt hochladen → Vorschau und Schnittstelle zeigen das neue Bild.
4. Lehrperson ohne jegliches Bild → Veröffentlichen bleibt blockiert mit Hinweis „Portraitbild".
