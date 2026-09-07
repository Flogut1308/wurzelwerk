## ADR-014 — Umschrift und Suche über Schriftsysteme

**Status:** entschieden (E20, N5)

**Kontext:** Russisches und polnisches Material ist möglich (E9). Namen und Orte können
kyrillisch oder mit polnischen Diakritika vorliegen.

**Entscheidung:** Drei getrennte Ebenen, die nie vermischt werden:

1. **Original** — exakt wie in der Quelle, mit Schriftangabe (`cyrl`, `latn`). Führend, wird nie überschrieben.
2. **Umschrift** — automatisch erzeugt nach **ISO 9** (wissenschaftlich, eindeutig umkehrbar) als Standard, **DIN 1460** wählbar. Eigener Namenseintrag mit Typ `transliteriert`, gekennzeichnet als automatisch erzeugt. Eine manuell korrigierte Umschrift überschreibt die automatische und behält diese Markierung nicht.
3. **Suchnormalform** — diakritikafrei und kleingeschrieben (`Wróbel` → `wrobel`, `Щербаков` → `scerbakov`), zusätzlich Kölner Phonetik. Nur für den Index, nie angezeigt.

**Begründung für ISO 9 als Standard:** Sie ist eindeutig umkehrbar — aus der Umschrift lässt
sich das kyrillische Original rekonstruieren. DIN 1460 ist besser lesbar, aber nicht verlustfrei.
Für eine Datenbank ist Umkehrbarkeit wichtiger als Lesbarkeit; die Lesbarkeit liefert das
Original selbst, das ja mitangezeigt wird.

**Konsequenz:** Suche muss immer über Original, Umschrift und Suchnormalform gleichzeitig
laufen. Eine Eingabe in lateinischer Schrift muss kyrillische Treffer finden und umgekehrt.
Das ist eine Anforderung an den FTS5-Index, nicht ein Nachgedanke.

---

# Nachtrag Architekturplanung, 23.08.2026 — ADR-015 bis ADR-024

Alle zehn ADRs entstanden bei der Architekturplanung für Phase 0 und 1. Ausführliche
Begründungen und Codebeispiele: `55_Architektur.md`.
