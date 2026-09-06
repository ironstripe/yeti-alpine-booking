# CRM & Datenqualität — Block 4

Ziel: Kunden schnell finden, Buchungshistorie ohne Ticket-Öffnen verstehen, Dubletten sicher und rückholbar zusammenführen.

## Was ich im System geprüft habe

- Alle 943 Kunden haben bereits eine eindeutige, permanente Kundennummer — hier ist nichts zu reparieren, nur die Anzeige zu ergänzen.
- `customers.notes` ist das bestehende interne Bemerkungsfeld. Es wird kein zweites Feld angelegt.
- Auf Kunden verweisen: Teilnehmer, Buchungen, Rechnungen, Guthaben, Rückerstattungen, Kontaktpersonen, Gutscheine (Käufer) sowie Konversationen (zwei Verweise: zugeordnet und erkannt).
- Auf Teilnehmer verweisen: Buchungspositionen, Kursanmeldungen, Level-Historie, Umteilungsanfragen, Event-Teilnahmen.
- Die E-Mail-Adresse eines Kunden ist systemweit eindeutig — beim Zusammenführen zweier Datensätze mit derselben Adresse muss die Quelle zuerst freigegeben werden, sonst bricht der Vorgang ab.

## Phase 1 — Einheitliche Suche

Eine einzige serverseitige Suchfunktion `search_customers(query, limit)`:

- Eingabe wird kleingeschrieben, Leerzeichen bereinigt, Akzente entfernt (`Bühler` = `Buhler`), Telefonzeichen normalisiert, in Wörter zerlegt.
- Gesucht wird über Vor-/Nachname in beiden Reihenfolgen, Kundennummer, E-Mail, Telefon und Zusatztelefone, Organisationsname und die Namen der zugeordneten Teilnehmer. Bei mehreren Wörtern müssen alle treffen — beim Kunden oder bei einem seiner Teilnehmer.
- Reihenfolge der Treffer: Kundennummer, E-Mail/Telefon, voller Kundenname, Teilnehmername, Wortanfang, Teiltreffer.
- Jedes Ergebnis liefert Kundennummer, Name, E-Mail, Telefon, Ort, Teilnehmernamen und den Trefferhinweis („Gefunden über Teilnehmerin Anna Bühler").
- Archivierte (zusammengeführte) Datensätze erscheinen nicht.

Verwendet wird sie überall gleich: Kundenliste, Buchungsassistent/Kundenauswahl, Stundenplan-Suche, globale Suche (Cmd+K). Mit 300 ms Verzögerung, Lade- und Leerzustand, Tastaturbedienung. Bestehende Links bleiben gültig. Aus einer leeren Suche entsteht weiterhin kein Kunde automatisch.

## Phase 2 — Aussagekräftige Buchungshistorie

Die Karte im Kundenprofil zeigt pro Buchung: Buchungsnummer, Kursdatum bzw. -zeitraum, Kurs-/Produktname, Teilnehmer, Buchungs- und Zahlungsstatus. Ausklappbar zusätzlich: Lehrer, Treffpunkt, Privat/Gruppe, Gesamt-, bezahlter und offener Betrag sowie das Erstelldatum.

- Mehrere Produkte: erstes Produkt plus „+N weitere".
- Stornierte Positionen zählen nicht zum aktiven Kursinhalt; komplett stornierte Buchungen werden als storniert markiert.
- Sortierung: nächster Kurstermin zuerst, danach vergangene absteigend.
- Alles in einer Abfrage (Positionen, Produkte, Teilnehmer, Lehrer gemeinsam geladen), Status-Beschriftungen aus den bestehenden gemeinsamen Helfern.

## Phase 3 — Sicheres Zusammenführen

Grundsatz: Zusammenführen löscht nichts. Beziehungen wandern zur bleibenden Person, die Dublette wird archiviert und verweist dauerhaft auf sie.

**Datenbasis:** neue Tabelle `entity_merges` (Typ, Quelle, Ziel, gewählte Feldauflösung, Beziehungsübersicht, ausgeführt von/am, Rücknahmefrist, Rücknahme von/am) sowie an Kunden und Teilnehmern die Felder `merged_into_id`, `merged_at`, `merged_by`, `is_archived`. Alte Links auf archivierte Datensätze leiten auf den bleibenden weiter.

**Kundenzusammenführung** als Assistent in vier Schritten (Ziel wählen → Daten klären → Übertragung prüfen → bestätigen), erreichbar über das Menü in der Kundenansicht, nur für Rollen mit Stammdatenrechten (bestehendes Rollenmodell).

- Schritt 2 stellt alle abweichenden Felder gegenüber (Anrede, Namen, E-Mails, Telefone, Adressen, Sprache, Kanal, Organisation, Werbeeinwilligung, interne Bemerkungen). Nichts wird stillschweigend überschrieben. Kundennummer des Ziels bleibt, die der Quelle wird als Alias im Protokoll archiviert. Zusatzkontakte werden ohne Doppel zusammengelegt, Bemerkungen mit Quelle und Datum aneinandergehängt. Eine Werbeeinwilligung wird durch das Zusammenführen nie von „nein/unbekannt" auf „ja" gehoben.
- Schritt 3 zeigt gezählt, was übertragen wird: Teilnehmer, Buchungen (inkl. geteilter Privatstunden), Rechnungen, Guthaben und deren Verbrauch, Rückerstattungen, Gutscheine, Kontaktpersonen, Konversationen, Stornierungen und Historie.
- Schritt 4 verlangt eine ausdrückliche Bestätigung mit beiden Namen und Nummern; der Knopf heisst „[Quelle] in [Ziel] zusammenführen".
- Ausführung in einer einzigen serverseitigen Transaktion mit fester Tabellenliste: beide Datensätze sperren, prüfen dass keiner bereits zusammengeführt ist, Felder setzen, Beziehungen umhängen, Eindeutigkeitskonflikte (z. B. gleiche E-Mail) auflösen, Quelle archivieren, Protokoll schreiben. Jeder Fehler macht alles rückgängig.

**Sonderfälle:** Wahrscheinliche Teilnehmer-Dubletten stoppen den Vorgang, bis sie im selben Ablauf geklärt sind. Guthaben werden als vollständige Buchungsposten übertragen, nie als Summe zusammengerechnet; das Ergebnis wird in der Vorschau gezeigt. Bei geteilten Privatstunden wechselt nur die Inhaberschaft der Buchung — Termin, Lehrer, Aufteilung bleiben unangetastet. Rechnungen und Rückerstattungen behalten Nummer, Betrag und Status.

**Teilnehmerzusammenführung** analog über das Menü der Teilnehmerkarte: Vergleich von Name, Geburtsdatum, Sportart, aktuellen und selbst eingeschätzten Levels, Saisonlevels und Bemerkungen. Beide müssen am Ende demselben Kunden gehören. Buchungspositionen, Level-Historie, Kurs-/Gruppenzuteilungen und Bemerkungen wandern mit; Bewertungshistorie wird nie überschrieben, Levelkonflikte müssen ausdrücklich entschieden werden, doppelte Anmeldungen werden verhindert. Quelle wird archiviert, Vorgang protokolliert.

**Rücknahme** innerhalb von 24 Stunden, serverseitig, rechtegeschützt und vollständig — oder blockiert mit klarer Begründung, falls seither Änderungen erfolgt sind. Zusammenführung und Rücknahme erscheinen in der bestehenden Verlaufsanzeige.

## Phase 4 — Bestehendes prüfen

Kundennummer in Liste, Detailseite, Kundenauswahl und Suchergebnissen sichtbar machen. Internes Feld überall als „Interne Bemerkungen" beschriften und sicherstellen, dass es in Bestätigungen, Rechnungen, Website-Antworten, Lehreransichten und öffentlichen Schnittstellen nicht auftaucht. Änderungen daran werden im Verlauf vermerkt.

## Nicht enthalten

Datenaustausch mit anderen Skischulen, automatisches Zusammenführen ohne Bestätigung, Löschen von Finanz- oder Buchungsdaten, Änderungen an Preisen/Zahlungslogik, neues Rollenmodell.
