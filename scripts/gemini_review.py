#!/usr/bin/env python3
"""Pragmatismus-Review eines Git-Diffs ueber die Gemini-API.

Wird von .github/workflows/gemini-pr-review.yml (Pull Requests) und
.github/workflows/gemini-main-guard.yml (Direktcommits auf main) genutzt, damit
Prompt, Modellwahl, Retry und Verdict-Auswertung nur an einer Stelle stehen.

Exit-Code 0: Review erzeugt; Verdict BLOCK, SHIP oder UNKNOWN.
Exit-Code 1: Aufruffehler (fehlender Key, fehlender/leerer Diff).
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_MODELS = "gemini-3.8-flash,gemini-3.5-flash-lite"
RETRYABLE = (429, 500, 502, 503, 504)
COMMENT_MARKER = "<!-- gemini-pragmatism-review -->"
DIFF_LIMIT = 50000

PROMPT = """Du bist der pragmatische Tech-Lead und Gatekeeper. Dein Ziel: Schnelles Shipping (MVP), saubere Architektur, null Overengineering.
Verhindere das 'Agent Rabbit Hole' (endlose Loops aus Refactoring, Mini-Tests, unnoetigen Abstraktionen).

Kontext: {head}

Analysiere den folgenden Git-Diff:
```
{diff}
```

Wichtig: Beurteile keine Versions-, Modell- oder API-Aktualitaet aus deinem Trainingswissen.
Wenn du etwas fuer veraltet haeltst, belege es mit einer Datei oder Zeile im Diff oder formuliere
es als Frage - ein BLOCK wegen angeblicher Versionsaktualitaet ohne Beleg ist unzulaessig.

Antworte nach exakt diesem Schema:
1. **Verdict**: [SHIP IT 🚀] oder [BLOCK 🛑] (Nur blocken bei echten Showstoppern/Bugs oder extremem Scope Creep!)
2. **Pragmatismus-Check**: Wurde hier unnoetiges Zeug gebaut, das niemand bestellt hat?
3. **Maximal 2-3 konkrete Bulletpoints**: Was muss zwingend gefixt werden (falls BLOCK), oder was ist die Essenz (falls SHIP IT).
Halte dich kurz, direkt und loesungsorientiert.
"""


def call_gemini(models, prompt, api_key, timeout=120):
    """Ruft die Modelle der Reihe nach auf; Retry nur bei Kapazitaetsfehlern."""
    data = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
    errors = []
    for model in models:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )
        for attempt in range(1, 4):
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    result = json.loads(resp.read().decode("utf-8"))
                text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
                return text, model, errors
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="ignore")[:300]
                errors.append(f"{model} Versuch {attempt}: HTTP {exc.code} {body}")
                if exc.code in RETRYABLE and attempt < 3:
                    time.sleep(5 * attempt)
                    continue
                break
            except Exception as exc:  # noqa: BLE001 - Ursache soll im Log stehen
                errors.append(f"{model} Versuch {attempt}: {type(exc).__name__} {exc}")
                break
    return None, None, errors


def verdict_of(text):
    """Liest das Verdict aus der Antwort. Unklar -> UNKNOWN (blockiert nicht)."""
    has_block = "[BLOCK" in text
    has_ship = "[SHIP IT" in text
    if has_block and not has_ship:
        return "BLOCK"
    if has_ship and not has_block:
        return "SHIP"
    return "UNKNOWN"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--diff-file", required=True)
    parser.add_argument("--out-review", required=True)
    parser.add_argument("--out-verdict", required=True)
    parser.add_argument("--head", default="unbekannter Stand")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY fehlt", file=sys.stderr)
        return 1

    try:
        with open(args.diff_file, "r", encoding="utf-8", errors="ignore") as handle:
            diff = handle.read()
    except OSError as exc:
        print(f"Diff nicht lesbar: {exc}", file=sys.stderr)
        return 1

    if not diff.strip():
        print("Diff ist leer - kein Review noetig.")
        with open(args.out_verdict, "w", encoding="utf-8") as handle:
            handle.write("UNKNOWN\n")
        with open(args.out_review, "w", encoding="utf-8") as handle:
            handle.write(
                "### 🤖 Gemini Pragmatism Review\n\n"
                "Kein prueffaehiger Diff gefunden.\n\n" + COMMENT_MARKER + "\n"
            )
        return 0

    truncated = len(diff) > DIFF_LIMIT
    diff_sample = diff[:DIFF_LIMIT]
    models = [
        m.strip()
        for m in os.environ.get("GEMINI_MODELS", DEFAULT_MODELS).split(",")
        if m.strip()
    ]

    text, model, errors = call_gemini(
        models, PROMPT.format(head=args.head, diff=diff_sample), api_key
    )

    if text:
        verdict = verdict_of(text)
        body = [
            "### 🤖 Gemini Pragmatism Review",
            "",
            f"_Modell: `{model}` · Stand: {args.head}_",
            "",
        ]
        if truncated:
            body += [
                f"> Diff gekuerzt auf {DIFF_LIMIT} Zeichen; die Bewertung deckt nur "
                "den Anfang des Diffs ab.",
                "",
            ]
        body.append(text)
        body += ["", COMMENT_MARKER]
    else:
        verdict = "UNKNOWN"
        detail = "\n".join(f"- {e}" for e in errors) or "- kein Modellaufruf moeglich"
        body = [
            "### 🤖 Gemini Pragmatism Review",
            "",
            "**Verdict**: UNVERIFIED – kein belastbares Ergebnis.",
            "",
            "Das Gate blockiert diesen Lauf nicht. Ursache der Modell-/API-Seite:",
            "",
            detail,
            "",
            COMMENT_MARKER,
        ]
        print("Kein Verdict:", detail, file=sys.stderr)

    with open(args.out_review, "w", encoding="utf-8") as handle:
        handle.write("\n".join(body) + "\n")
    with open(args.out_verdict, "w", encoding="utf-8") as handle:
        handle.write(verdict + "\n")

    print(f"Verdict: {verdict} (Modell: {model or 'keines'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())