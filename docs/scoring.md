# Scoring — Empfehlungslogik

Definiert, **wie** der Haltestellensimulator pro Haltestelle eine Empfehlung berechnet.

Stand: **Entwurf v0** — Schwellwerte und Gewichte sind erste Vorschläge und werden in Phase 3 mit ZVV/VBZ kalibriert.

## Designprinzipien

1. **Deterministisch** — gleicher Input → gleiches Ergebnis. Keine ML-Blackbox im MVP.
2. **Erklärbar** — jede Empfehlung enthält `reasoning[]` (Mensch lesbar) und `score_breakdown` (Komponenten).
3. **Versioniert** — jede Empfehlung trägt `rule_version` (z. B. `scoring@0.3.0`); ältere Empfehlungen bleiben reproduzierbar.
4. **`unknown` respektieren** — fehlende Daten ziehen Confidence runter, defaulten nicht zu `no`.
5. **POI-Relevanz fliesst ein** — eine Haltestelle bei einer grossen Event-Location bekommt einen höheren Anzahl-Vorschlag.

---

## Outputs (siehe `data-model.md` → `Recommendation`)

```ts
type Recommendation = {
  element_size: "S" | "M" | "L" | "XL" | "XXL";
  element_count: number;            // ≥ 0
  hardware_class: HardwareClass;    // A_… | … | G_UNKNOWN
  reasoning: string[];              // Bullet-Liste auf Deutsch
  score_breakdown: {
    frequency: number;              // 0..1
    poi_relevance: number;          // 0..1
    infrastructure: number;         // 0..1
    operator_weight: number;        // 0..1, ggf. ZVV/VBZ-spezifisch
    raw_total: number;              // ungewichtete Summe
    weighted_total: number;         // mit Gewichten verrechnet
  };
  confidence: number;               // 0..1
  rule_version: string;             // z. B. "scoring@0.3.0"
};
```

---

## 1. Elementgrösse (S / M / L / XL / XXL)

Bestimmt durch **Frequenz** (GTFS) mit Modifikator durch **POI-Relevanz**.

### Basis: Tägliche Abfahrten

| Tägl. Abfahrten | Basis-Grösse |
|---|---|
| < 50 | S |
| 50–199 | M |
| 200–499 | L |
| 500–999 | XL |
| ≥ 1000 | XXL |

### Modifikator durch POI-Relevanz

- `relevance_sum_300m ≥ 5.0` → eine Stufe **hoch** (max XXL).
- `relevance_sum_300m ≥ 10.0` → zwei Stufen **hoch**.
- Event-aktiv (mind. ein POI mit `valid_from ≤ heute ≤ valid_to`) → eine zusätzliche Stufe **hoch** (temporär, mit Hinweis in `reasoning[]`).

### Modifikator durch Wartehaus

- Kein Wartehaus (`wartehaus = no`) und Grundgrösse ≥ XL → **eine Stufe runter** (begründet: ohne Wartefläche keine grossen statischen Tafeln sinnvoll).
- Wartehaus = `unknown` → keine Anpassung, aber Confidence-Abzug.

---

## 2. Anzahl Elemente

Heuristik:

| Bedingung | Empfohlene Anzahl |
|---|---|
| Grösse S | 1 |
| Grösse M | 1 |
| Grösse L | 1–2 (2 wenn `served_routes ≥ 3`) |
| Grösse XL | 2 |
| Grösse XXL | 2–3 (3 wenn `served_routes ≥ 5` ODER Event-aktiv) |

Sonderfälle:
- Haltestelle mit getrennten Richtungen (gegenüberliegende Steige) zählt als **2 Stops** — je separat berechnet.
- POI-Hotspot (`relevance_sum_300m ≥ 10.0`) → +1, max 4.

---

## 3. Hardware-Integrationsklasse

Bestimmt durch die fünf Pflicht-Flags. Erste passende Regel gewinnt.

```
Input: dfi_standfuss, dfi_strommast, ticketautomat, strom, wartehaus  ∈ {yes, no, unknown}

Wenn ALLE fünf Flags == unknown:
  → G_UNKNOWN
  → reasoning: "Datenlage unzureichend: alle Pflichtmerkmale unbekannt."

Sonst, in dieser Reihenfolge:

1. dfi_standfuss == yes
   → A_REUSE_DFI_STANDALONE

2. dfi_strommast == yes
   → B_REUSE_DFI_POLE

3. ticketautomat == yes
   → C_REUSE_TICKET_MACHINE

4. wartehaus == yes
   → D_REUSE_SHELTER

5. strom == yes
   → E_POWER_AVAILABLE_NEW_MOUNT

6. strom == no UND wartehaus == no
   → F_NO_HARDWARE

7. Sonst (zu viele unknown):
   → G_UNKNOWN  (mit reasoning, welche Flags fehlen)
```

Wenn das Ergebnis `G_UNKNOWN` ist, muss `reasoning[]` explizit auflisten, **welche** Flags `unknown` sind.

---

## 4. Score-Aufteilung

```
score_breakdown = {
  frequency:      f_freq(daily_departures)        ∈ [0, 1]
  poi_relevance:  f_poi(relevance_sum_300m, events) ∈ [0, 1]
  infrastructure: f_infra(flags)                  ∈ [0, 1]
  operator_weight: f_operator(operator)           ∈ [0, 1]
}
```

### Frequenz-Funktion

```
f_freq(d) = min(1.0, log10(max(d, 1)) / 3.0)    // 1000 Abfahrten → ~1.0
```

### POI-Relevanz-Funktion

```
f_poi(sum, events_active) = min(1.0, sum / 10.0) + (0.1 if events_active else 0)
                           , dann auf [0,1] geklemmt
```

### Infrastruktur-Funktion

Jeder bekannte `yes`-Wert zählt nach Gewicht:

| Flag | Gewicht |
|---|---|
| `dfi_standfuss` = yes | 0.30 |
| `dfi_strommast` = yes | 0.20 |
| `wartehaus` = yes | 0.20 |
| `strom` = yes | 0.20 |
| `ticketautomat` = yes | 0.10 |

`f_infra` = Summe der Gewichte (max 1.0). `unknown` und `no` zählen 0.

### Operator-Gewicht (Platzhalter)

Default `1.0` — falls ZVV vs VBZ unterschiedlich gewichtet werden soll, hier anpassen.

### Weighted Total

```
weighted_total = 0.45 * frequency
               + 0.25 * poi_relevance
               + 0.20 * infrastructure
               + 0.10 * operator_weight
```

`weighted_total` ist primär **für interne Sortierung / Filter**, nicht für die Endempfehlung — Grösse und HW-Klasse haben eigene Regeln (oben).

---

## 5. Confidence

```
known_flags = Anzahl Flags mit Wert ≠ unknown   (0..5)

confidence_base = known_flags / 5.0

Abzüge:
- needs_manual_match (kein GTFS-Match): -0.20
- POI-Daten älter als 12 Monate: -0.10
- GTFS älter als 90 Tage: -0.10
- Excel-Import älter als 12 Monate: -0.10

confidence = max(0.0, min(1.0, confidence_base - Σ Abzüge))
```

### Confidence-Schwellen für UI

| Confidence | Label | Farbe (Vorschlag) |
|---|---|---|
| ≥ 0.8 | Hoch | grün |
| 0.5–0.79 | Mittel | gelb |
| < 0.5 | Niedrig | rot |

Empfehlungen mit Confidence < 0.3 werden in der UI mit Hinweis "Datenlage zu schwach für belastbare Empfehlung" markiert.

---

## 6. `reasoning[]` — Aufbau

Strukturierte Bullets, jeweils mit Grund + Beleg:

```
[
  "Empfohlene Grösse L: 312 Abfahrten/Tag (Schwelle 200).",
  "POI-Relevanz im 300-m-Radius: 6.4 — eine Grössenstufe hoch.",
  "Hardware-Klasse A: DFI mit Standfuss bereits vorhanden.",
  "Confidence 0.80: 5/5 Pflichtmerkmale bekannt, GTFS aktuell.",
]
```

Regeln:
- Mindestens **eine Begründung pro Output-Feld** (Grösse, Anzahl, HW-Klasse, Confidence).
- Schwellwerte / Zahlen im Text mit nennen, damit Planer:innen den Rechenweg sehen.
- Bei Confidence < 0.5: explizite Auflistung der fehlenden / unsicheren Inputs.

---

## Versionierung

Jede Änderung an Schwellen, Gewichten oder Regeln bumpt `rule_version`:

- Patch (`0.3.x`): Schwellwerte verschoben, Texte angepasst.
- Minor (`0.x.0`): neue Faktoren, neue Reasoning-Zeilen.
- Major (`x.0.0`): inkompatible Strukturänderung an `Recommendation`.

Alte `Recommendation`-Snapshots bleiben mit ihrer `rule_version` reproduzierbar — `inputs_snapshot` ist Pflichtfeld (siehe `data-model.md`).
