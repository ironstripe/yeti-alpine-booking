# Roadmap: Website → Yeti Buchungs-Intake

## Was wir bauen
Eine öffentliche Edge Function `intake-booking` in Yeti, die Buchungen von der Website (und später Vapi/Make) empfängt und **direkt** als Ticket + Ticket-Items + Customer anlegt. Schutz via API-Key. Bei Validierungsfehler → HTTP 400.

## Phasen-Übersicht

```text
Phase 1: Fundament (jetzt)
  └─ Vertrag definieren (JSON-Schema) + Secret anlegen
Phase 2: Endpoint bauen
  └─ Edge Function intake-booking in Yeti
Phase 3: Website anbinden
  └─ Lovable-Website ruft Endpoint statt eigener DB
Phase 4: Bot anbinden
  └─ Vapi → Make → selber Endpoint
```

---

## Phase 1 — Was wir ZUERST brauchen (bevor Code geschrieben wird)

### 1.1 Datenvertrag festlegen (wichtigster Schritt)
Wir definieren **genau ein** JSON-Format, das sowohl Website-Formular als auch Vapi/Make liefern müssen. Vorschlag (Pflichtfelder für CH-Vertrag + AGB/Datenschutz):

```text
{
  "source": "website" | "vapi",
  "customer": {
    "salutation", "first_name"*, "last_name"*,
    "email"*, "phone"*,
    "street"*, "zip"*, "city"*, "country"*  (CH-Vertrag)
  },
  "participants": [
    { "first_name"*, "last_name"*, "birth_date"*, "skill_level", "discipline"* }
  ],
  "booking": {
    "product_type"*: "private" | "group",
    "sport"*: "ski" | "snowboard",
    "dates"*: [{ "date", "start_time", "end_time" }],
    "participant_count"*,
    "notes"
  },
  "consent": {
    "agb_accepted"*: true,
    "agb_version"*: "2025-1",
    "privacy_accepted"*: true,
    "privacy_version"*: "2025-1",
    "accepted_at"*: ISO-Timestamp,
    "ip_address", "user_agent"
  }
}
```
\* = Pflicht, sonst HTTP 400.

### 1.2 Consent-Speicherung klären
Für rechtsgültigen CH-Vertrag müssen AGB/Datenschutz-Zustimmung **revisionssicher** gespeichert werden. Heute existiert dafür kein Feld in `tickets`. → In Phase 2 wahrscheinlich kleine Migration nötig (Tabelle `booking_consents` oder JSON-Spalte auf ticket).

### 1.3 Secret `YETI_INTAKE_API_KEY` anlegen
Zufälliger 32+ Zeichen Key. Wird in HTTP-Header `X-API-Key` mitgeschickt.

### 1.4 Verhalten bei Konflikten festlegen
- **Customer existiert schon (gleiche Email)** → wiederverwenden oder neuen anlegen?
- **Instructor-Zuweisung** → erst leer lassen (Office weist zu) oder schon Auto-Assign?
- **Zahlung** → Status `unpaid` mit offenem Betrag, Rechnung später?

---

## Phase 2 — Endpoint bauen (nach Freigabe Phase 1)
- Migration für Consent-Daten (falls nötig)
- Edge Function `intake-booking` (public, `verify_jwt = false`, validiert via Zod + API-Key)
- Anlage: `customers` (oder Match) → `tickets` → `ticket_items` → `booking_consents`
- Antwort: `{ ticket_id, ticket_number }` oder HTTP 400 mit Feldfehlern

## Phase 3 — Website (Lovable)
- Formular sammelt obige Felder inkl. AGB/Datenschutz-Checkboxen
- POST auf `https://pgrlrsrjwyixndmrzhct.supabase.co/functions/v1/intake-booking` mit `X-API-Key`

## Phase 4 — Vapi + Make
- Make-Szenario nimmt Vapi-Output, mappt aufs JSON-Schema, POST auf selben Endpoint

---

## Konkret jetzt zu entscheiden

1. **Datenvertrag oben OK** — oder Felder ergänzen/streichen?
2. **Customer-Dedupe**: Email-Match → vorhandenen Customer verwenden? (empfohlen: ja)
3. **Instructor-Assignment**: zuerst leer / Office weist manuell zu? (empfohlen: ja, sicherster Start)
4. **AGB/Datenschutz-Versionierung**: hast du schon Versionsnummern (z. B. "2025-1") oder sollen wir's neu anlegen?

Sobald diese 4 Punkte geklärt sind, schalte ich in Build-Modus, lege Secret + Migration + Edge Function an.
