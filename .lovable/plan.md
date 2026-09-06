# Einfache Website-Freigabe für Lehrpersonen (MVP)

Deine Einschätzung teile ich: Der frühere Freigabe-Workflow (Entwurf, Veröffentlichen, Einwilligung, eigenes Bildarchiv) ist für den Start zu schwer. Ein Häkchen plus Kurzbeschreibung unter dem Profilbild reicht.

## Aktueller Stand (geprüft)

- Die Lehrpersonen-Tabelle hat jetzt die zwei neuen Felder: "Auf Website anzeigen" (standardmässig aus) und "Kurzbeschreibung" (max. 280 Zeichen, mit dem vorgegebenen deutschen Standardtext).
- Die frühere separate Website-Profil-Tabelle wurde entfernt, es gibt also keine zweite konkurrierende Lösung mehr.
- Erste Anpassungen sind schon eingebaut: Häkchen und Kurzbeschreibung im Bearbeiten-Dialog, kompakte Anzeige mit Abzeichen "Auf Website" und Kurztext in der Kopfzeile der Lehrpersonen-Detailseite.
- Noch offen: der Bereich "Website" im Neuanlage-Dialog und die Website-Schnittstelle, die noch auf die gelöschte alte Tabelle zugreift und deshalb aktuell nichts liefert.

## Was noch umgesetzt wird

1. **Neuanlage-Dialog**: Abschnitt "Website" nach "Rollen & Qualifikationen" mit Häkchen "Auf Website anzeigen" (standardmässig aus), Hinweistext und Textfeld für die Kurzbeschreibung inkl. Zeichenzähler bis 280. Beides wird direkt mit der Lehrperson gespeichert.
2. **Bearbeiten-Dialog**: Feinschliff des bereits eingebauten Abschnitts direkt unter dem Profilbild, inklusive Hinweis "Für die Anzeige auf der Website fehlt noch ein Profilbild", wenn das Häkchen gesetzt ist, aber kein Bild vorhanden ist. Speichern bleibt möglich.
3. **Detailseite**: Abzeichen "Auf Website" plus Kurzbeschreibung unter Bild, Name und Rollenzeile; Hinweis für Büro/Admin, wenn das Bild fehlt. Kein neuer Reiter, keine grosse Karte.
4. **Website-Schnittstelle** `get-public-instructors`: liest nur noch direkt die Lehrpersonen und liefert ausschliesslich Anzeigename, Rollenbezeichnung, Kurzbeschreibung und Bildadresse — nur für aktive Personen mit gesetztem Häkchen, vorhandenem Bild und vorhandenem Text, sortiert nach Vor- und Nachname. Schutz weiterhin über denselben Schlüssel wie die anderen Website-Schnittstellen.
5. **Aufräumen und Prüfen**: alte Hilfsdateien des komplexen Ansatzes entfernen, Typprüfung laufen lassen.

## Technische Details

- Datenbank: `instructors.show_on_website` (boolean, default false), `instructors.website_teaser` (text, default Standardtext, Check ≤ 280 Zeichen), Teilindex für aktive, sichtbare Lehrpersonen; `instructor_public_profiles` gelöscht. Migration ist bereits angewendet.
- Rollenbezeichnung wird serverseitig aus `specialization`/`roles` abgeleitet: Skilehrperson, Snowboardlehrperson, Ski- und Snowboardlehrperson, Fallback Schneesportlehrperson.
- Änderungen beschränkt auf: `NewInstructorModal.tsx`, `EditInstructorModal.tsx`, `InstructorDetail.tsx`, `src/lib/website-profile.ts`, `supabase/functions/get-public-instructors/index.ts`.
- Rechte bleiben unverändert: nur Büro/Admin sehen und ändern diese Felder in der App; kein neuer Zugriff für Lehrpersonen, kein neues Bildarchiv, kein Schlüssel im Browser.

## Bewusster MVP-Kompromiss

Die Profilbilder liegen weiterhin im bestehenden, öffentlich lesbaren Bildarchiv. Das Häkchen steuert also, ob eine Person auf der Website erscheint — nicht, ob eine bereits bekannte direkte Bildadresse technisch abrufbar wäre. Das lässt sich später härten, ohne diesen einfachen Ablauf zu ändern.
