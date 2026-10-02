# Booking-Corner 26/27 – Kursplan (nicht aktiv)

`source-course-candidates.csv` enthält 370 periodische Booking-Quellkandidaten (340 Wochen-/Niveaukombinationen und 30 Kombinationen für zwei Samstagsserien). `course-manifest-not-active.csv` ist eine **rein lokale, deterministische Planung**, erzeugt durch `scripts/build_bc_2627_course_manifest.py` und in CI bytegenau gegengeprüft. **Kein SQL-Insert, keine Kursaktivierung und keine Webbuchbarkeit durch diese Dateien.**

Pro Niveau und Woche/Serie ist nur **eine Ausgangsgruppe** vorgesehen; 2h und 4h sind Produktvarianten derselben Niveaugruppe, kein doppelter Lehrer. 2h: 10–12 (später manuell auf 14–16 änderbar). 4h: zwei Blöcke, 10–12 und 14–16. Mittagspause/Mittagsbetreuung gehört nie automatisch zum 4h-Angebot und ist bei Bedarf separat zu buchen. Das Manifest projiziert maximal 3210 potenzielle **2h-Unterrichtsblöcke** über die 370 Ausgangsgruppen, nicht 3210 unabhängige Gruppen. `variant_day_counts` enthält nur die tatsächlich belegten Quellstaffeln. Das Quellen-SHA ist pro Zeile festgehalten.


**Vor jedem Live-Import zwingend auflösen:**

1. Die drei exakten Booking-Level `Ski Schwarzer König/Königin`, `Ski Kinder Fortgeschritten` und `Ski Erwachsene Wiedereinsteiger` fehlen im aktuellen YETI-`skill_levels`-Verzeichnis. Die Markierung `NEW:` darf nie als vorhandene ID verwendet werden. Die beiden Snowboard-Aktivitäten sind in Booking altersübergreifend, während YETIs bestehende `sb_adult_*`-IDs Erwachsene meinen. Die Markierung `REVIEW:` ist kein stillschweigendes Altersmapping. Passende Ziellevels/Alterssicht und deren Staff-UI sind vor Apply zu prüfen.
2. Kurs-/Produktvarianten, Scheduler und Website-Verfügbarkeit müssen dieselbe Kursinstanz/Gruppe referenzieren; `group_courses.product_id` kann aktuell nur eine der 2h-/4h-Varianten abbilden. Dafür ist eine eindeutige, idempotente Variantenrelation nötig.
3. Der in PR #28 geprüfte exakte Serverpreis ist **noch nicht** mit Reservierung, Bestätigung, Rechnung und OnePager verbunden. Altes Preismodell mit `products.price=0` darf niemals für diese Kurse abrechnen. Die Quelle hat für einige 2h-Produkte nur 1 Tag, für zwei 4h-Level nur 3 bzw. 5 Tage; diese Lücken sind bewusst nicht extrapoliert.
4. Vor einem Live-Apply: aktuelles Saison-/Produkt-/Skill-/Kurs-Vorherbild, Transaktions-Preflight, Pilotwoche, Kalender/Lehrer-Dashboard und doppelte Ausführung testen. Kein Dummy-Lehrer: `instructor_id` bleibt NULL; reale offene Zuordnungen sollen als Dashboard-Aufgabe erscheinen.
5. Carving Mixed/Ladies sind **nicht** in der 370er Matrix; Fixpreis je Teilnehmer und Gruppenkursdurchführung müssen nachgeliefert werden. Kein Carving-Checkout bis zur fachlichen Klärung.
