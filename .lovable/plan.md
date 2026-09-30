# Buchungsbestätigung: Tests mit simuliertem Mailversand

## Stand
Die Schutzregeln 1–3 und der Anfang von 4 sind in der gebauten Option A schon erfüllt:
- Keine automatische Wiederholung, kein Zeitplan-Job. Fehler werden dauerhaft gespeichert.
- Wiederholen nur für angemeldete Büro- und Admin-Konten (`retry-booking-confirmation`, verify_jwt=true, eigene Funktion).
- Keine Rechnungsmail, kein QR, keine IBAN, kein Zahlungslink, kein PDF.
- Keine Sonderregel für `@smoke.invalid` im Produktivcode.

Offen ist nur der Rest von Punkt 4: Die vorhandenen Tests prüfen bisher nur das Ausfüllen der Vorlage, nicht den Versand selbst.

## Was gebaut wird
Neue Tests für den Versand der Buchungsbestätigung. Der Mailanbieter wird simuliert, es geht keine echte E-Mail raus und die echte Datenbank wird nicht berührt.

Geprüfte Fälle:
1. Erfolg: genau ein Versand, Status „gesendet", Anbieter-ID gespeichert, Idempotenz-Schlüssel mitgeschickt.
2. Anbieter meldet Fehler: Status „fehlgeschlagen" mit Fehlercode, keine neue Wiederholung.
3. Vorlage fehlt oder ist ausgeschaltet: „fehlgeschlagen" (template_missing), kein Versandversuch.
4. Doppelter Aufruf: der zweite Aufruf bekommt den Eintrag nicht (atomare Übernahme), also kein zweiter Versand.
5. Bereits gesendeter Eintrag: kein erneuter Versand.
6. Mailinhalt enthält keine Zahlungsangaben (IBAN, QR, Konto, Zahlungslink).

Keine Änderung am Produktivverhalten. Zeigt ein Test einen echten Fehler, melde ich ihn zuerst, statt ihn still zu beheben.

## Technische Details
- Datei: `supabase/functions/_shared/bookingDelivery.test.ts` erweitern.
- `globalThis.fetch` pro Test ersetzen und danach zurücksetzen; Aufrufe an `api.resend.com` zählen und Header/Body prüfen.
- Kleiner In-Memory-Ersatz für den Datenbank-Client, der nur die von `attemptConfirmation` genutzten Aufrufe (select/update mit Bedingung/insert in email_logs) nachbildet; die bedingte Übernahme pending→sending liefert beim zweiten Aufruf keine Zeile.
- `RESEND_API_KEY` im Test per `Deno.env.set` mit Dummywert.
- Ausführen: `deno test --node-modules-dir=none --no-check --allow-env supabase/functions/_shared/bookingDelivery.test.ts`, dazu `bun test tests/` und Build.
